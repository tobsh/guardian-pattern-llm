import { describe, expect, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { AgentCoreGatewayStack } from '../lib/stacks/agentcore-gateway.stack';

describe('AgentCoreGatewayStack', () => {
  const app = new cdk.App();

  // Minimal host stack for the Cognito pool + Lambda the Gateway depends on
  const host = new cdk.Stack(app, 'HostStack', {
    env: { account: '123456789012', region: 'eu-central-1' },
  });
  const userPool = new cognito.UserPool(host, 'TestPool', {
    userPoolName: 'test-pool',
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });
  const mcpClient = userPool.addClient('McpClient', { generateSecret: false });
  const fakeFn = new lambda.Function(host, 'FakeFn', {
    runtime: lambda.Runtime.NODEJS_24_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler = async () => ({})'),
  });

  const stack = new AgentCoreGatewayStack(app, 'TestGatewayStack', {
    env: { account: '123456789012', region: 'eu-central-1' },
    userPool,
    allowedClientIds: [mcpClient.userPoolClientId],
    registrationClientId: mcpClient.userPoolClientId,
    orchestratorFn: fakeFn,
  });
  const template = Template.fromStack(stack);

  it('creates a BedrockAgentCore Gateway with CUSTOM_JWT authorizer', () => {
    template.hasResourceProperties('AWS::BedrockAgentCore::Gateway', {
      ProtocolType: 'MCP',
      AuthorizerType: 'CUSTOM_JWT',
    });
  });

  it('creates a Gateway Target with a send_turn tool schema', () => {
    template.hasResourceProperties('AWS::BedrockAgentCore::GatewayTarget', {
      TargetConfiguration: Match.objectLike({
        Mcp: Match.objectLike({
          Lambda: Match.objectLike({
            ToolSchema: Match.objectLike({
              InlinePayload: Match.arrayWith([Match.objectLike({ Name: 'send_turn' })]),
            }),
          }),
        }),
      }),
    });
  });

  it('creates an IAM role for the gateway assumed by bedrock-agentcore', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'bedrock-agentcore.amazonaws.com' },
          }),
        ]),
      }),
    });
  });

  it('creates the OIDC proxy REST API with /.well-known/openid-configuration', () => {
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
    const methods = template.findResources('AWS::ApiGateway::Method');
    const httpMethods = Object.values(methods).map(
      (r) => (r as { readonly Properties: { readonly HttpMethod: string } }).Properties.HttpMethod
    );
    expect(httpMethods).toContain('GET');
    expect(httpMethods).toContain('POST');
  });

  it('uses GATEWAY_IAM_ROLE credential provider for the Lambda target', () => {
    template.hasResourceProperties('AWS::BedrockAgentCore::GatewayTarget', {
      CredentialProviderConfigurations: Match.arrayWith([
        Match.objectLike({ CredentialProviderType: 'GATEWAY_IAM_ROLE' }),
      ]),
    });
  });
});
