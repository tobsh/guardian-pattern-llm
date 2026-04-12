import { describe, expect, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { GuardianPocStack } from '../lib/stacks/guardian-poc.stack';

describe('GuardianPocStack', () => {
  const app = new cdk.App();

  // Minimal host stack to hold the Cognito User Pool the Guardian stack
  // depends on. Real deploys pass the pool in from AuthStack; tests fake it.
  const authStack = new cdk.Stack(app, 'FakeAuthStack', {
    env: { account: '123456789012', region: 'eu-central-1' },
  });
  const userPool = new cognito.UserPool(authStack, 'TestPool', {
    userPoolName: 'test-pool',
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });
  const webClient = userPool.addClient('WebClient', { generateSecret: false });
  const mcpClient = userPool.addClient('McpClient', { generateSecret: false });

  const stack = new GuardianPocStack(app, 'TestStack', {
    env: { account: '123456789012', region: 'eu-central-1' },
    guardianModelId: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
    coachModelId: 'eu.anthropic.claude-sonnet-4-6',
    userPool,
    allowedClientIds: [webClient.userPoolClientId, mcpClient.userPoolClientId],
  });
  cdk.Tags.of(app).add('project', 'guardian-demo');
  const template = Template.fromStack(stack);

  it('creates a versioned S3 bucket for the constitution', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  it('creates at least one Lambda function', () => {
    const fns = template.findResources('AWS::Lambda::Function');
    expect(Object.keys(fns).length).toBeGreaterThanOrEqual(1);
  });

  it('creates a POST /turn route with a JWT authorizer attached', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /turn',
      AuthorizationType: 'JWT',
    });
  });

  it('does NOT create any route with AuthorizationType NONE (no public endpoints)', () => {
    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    for (const [, resource] of Object.entries(routes)) {
      const authType = (
        resource as { readonly Properties: { readonly AuthorizationType?: string } }
      ).Properties.AuthorizationType;
      expect(authType).toBe('JWT');
    }
  });

  it('creates exactly one JWT authorizer on the HTTP API', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
    });
  });

  it('grants InvokeModel on EU Bedrock models to the Lambda role', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'bedrock:InvokeModel',
            Effect: 'Allow',
          }),
        ]),
      }),
    });
  });

  it('applies guardian-demo project tag to the S3 bucket', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      Tags: Match.arrayWith([Match.objectLike({ Key: 'project', Value: 'guardian-demo' })]),
    });
  });
});
