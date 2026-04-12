import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { OidcProxy } from '../constructs/oidc-proxy';

export type AgentCoreGatewayStackProps = cdk.StackProps & {
  /** Gateway name (globally unique within the AWS account). */
  readonly gatewayName?: string;
  /** Cognito User Pool that issues the inbound JWTs. */
  readonly userPool: cognito.IUserPool;
  /** App Client IDs allowed to call the gateway. */
  readonly allowedClientIds: readonly string[];
  /**
   * Pre-configured client ID echoed back from the OIDC proxy's
   * RFC 7591 registration endpoint — typically the McpClient ID.
   */
  readonly registrationClientId: string;
  /** The Guardian orchestrator Lambda function to target. */
  readonly orchestratorFn: lambda.IFunction;
  /** DEBUG in dev, ERROR in prod. */
  readonly exceptionLevel?: 'DEBUG' | 'ERROR';
};

/**
 * Bedrock AgentCore Gateway exposing the Guardian as an MCP tool.
 *
 * Architecture:
 *   MCP client (Cursor, Claude Desktop, MCP Inspector)
 *     → Cognito Hosted UI (via OIDC Proxy for PKCE advertisement + RFC 7591)
 *     → Gateway (CUSTOM_JWT validates the user's access token)
 *     → Lambda invoke (Gateway's IAM role calls the orchestrator directly)
 *     → Guardian flow
 *
 * Why Lambda-direct and not OpenAPI target:
 *   Our /turn HTTP API enforces Cognito JWT — the Gateway can't forward
 *   a user's JWT to an API Gateway v2 HTTP API (HTTP APIs don't support
 *   IAM auth, and the AgentCore OpenAPI target uses the Gateway's IAM
 *   role, not the user's token). Lambda direct invoke is cleaner: the
 *   Gateway is the trust boundary, validates the user, then calls the
 *   orchestrator with its own `lambda:InvokeFunction` permission.
 *
 * Patterns mirrored from ibkr-flexsync/infrastructure/lib/stacks/agentcore-gateway.stack.ts.
 */
export class AgentCoreGatewayStack extends cdk.Stack {
  public readonly gatewayArn: string;
  public readonly gatewayEndpoint: string;
  public readonly oidcProxy: OidcProxy;

  constructor(scope: Construct, id: string, props: AgentCoreGatewayStackProps) {
    super(scope, id, props);

    const gatewayName = props.gatewayName ?? 'guardian-demo-guardian-gateway';
    const exceptionLevel = props.exceptionLevel ?? 'DEBUG';

    // ==========================================================================
    // IAM Role for AgentCore Gateway
    // ==========================================================================
    const gatewayRole = new iam.Role(this, 'GatewayRole', {
      roleName: `${gatewayName}-role`,
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'IAM role for AgentCore Gateway to invoke the Guardian orchestrator Lambda',
    });

    // Allow Gateway to invoke the Guardian orchestrator Lambda directly
    props.orchestratorFn.grantInvoke(gatewayRole);

    // Allow Gateway to get workload identity tokens (required for all
    // AgentCore resource-access flows, even when not using outbound OAuth)
    gatewayRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore:GetWorkloadAccessToken',
          'bedrock-agentcore:GetResourceApiKey',
          'bedrock-agentcore:InvokeGateway',
        ],
        resources: ['*'],
      })
    );

    // ==========================================================================
    // OIDC Discovery Proxy (Cognito → MCP compatibility)
    // ==========================================================================
    const cognitoRegion = cdk.Stack.of(props.userPool).region;
    const cognitoDiscoveryUrl = `https://cognito-idp.${cognitoRegion}.amazonaws.com/${props.userPool.userPoolId}/.well-known/openid-configuration`;

    this.oidcProxy = new OidcProxy(this, 'OidcProxy', {
      cognitoDiscoveryUrl,
      clientId: props.registrationClientId,
      namePrefix: `${gatewayName}-oidc-proxy`,
    });

    // ==========================================================================
    // AgentCore Gateway — CUSTOM_JWT inbound, MCP protocol
    // ==========================================================================
    const gateway = new cdk.CfnResource(this, 'Gateway', {
      type: 'AWS::BedrockAgentCore::Gateway',
      properties: {
        Name: gatewayName,
        Description: 'MCP Gateway for guardian-demo Guardian — send coaching turns via MCP clients',
        ProtocolType: 'MCP',
        AuthorizerType: 'CUSTOM_JWT',
        AuthorizerConfiguration: {
          CustomJWTAuthorizer: {
            AllowedClients: [...props.allowedClientIds],
            DiscoveryUrl: this.oidcProxy.discoveryUrl,
          },
        },
        RoleArn: gatewayRole.roleArn,
        ExceptionLevel: exceptionLevel,
      },
    });

    this.gatewayArn = gateway.getAtt('GatewayArn').toString();
    this.gatewayEndpoint = `https://${gateway.ref}.gateway.bedrock-agentcore.${this.region}.amazonaws.com/mcp`;

    // ==========================================================================
    // Gateway Target — Lambda direct invoke with inline tool schema
    // ==========================================================================
    // One MCP tool: `send_turn`. Input is the user's message, output is
    // the Guardian verdict + coach response. The Gateway invokes the
    // orchestrator Lambda with its IAM role and forwards the result.
    const gatewayTarget = new cdk.CfnResource(this, 'GatewayTarget', {
      type: 'AWS::BedrockAgentCore::GatewayTarget',
      properties: {
        GatewayIdentifier: gateway.ref,
        Name: 'guardian-orchestrator',
        Description: 'Guardian orchestrator Lambda — one tool: send_turn',
        TargetConfiguration: {
          Mcp: {
            Lambda: {
              LambdaArn: props.orchestratorFn.functionArn,
              ToolSchema: {
                InlinePayload: [
                  {
                    Name: 'send_turn',
                    Description:
                      'Send a coaching message to the Guardian. Returns the Guardian verdict and the coach response.',
                    // Bedrock AgentCore uses its own PascalCase schema
                    // variant, not stock JSON Schema. Lowercase type names
                    // in the enum (`string`, `object`), uppercase struct
                    // keys (`Type`, `Properties`, `Required`).
                    InputSchema: {
                      Type: 'object',
                      Properties: {
                        message: {
                          Type: 'string',
                          Description: 'The user message for the coaching turn.',
                        },
                      },
                      Required: ['message'],
                    },
                  },
                ],
              },
            },
          },
        },
        // Lambda targets use the Gateway's IAM role implicitly.
        // GATEWAY_IAM_ROLE is the only valid provider type here.
        CredentialProviderConfigurations: [
          {
            CredentialProviderType: 'GATEWAY_IAM_ROLE',
          },
        ],
      },
    });

    gatewayTarget.addDependency(gateway);

    // ==========================================================================
    // Outputs
    // ==========================================================================
    new cdk.CfnOutput(this, 'GatewayArn', {
      value: this.gatewayArn,
      description: 'AgentCore Gateway ARN',
      exportName: 'GuardianDemoGuardianGatewayArn',
    });

    new cdk.CfnOutput(this, 'GatewayEndpoint', {
      value: this.gatewayEndpoint,
      description: 'MCP endpoint URL for clients (Cursor, Claude Desktop, MCP Inspector)',
      exportName: 'GuardianDemoGuardianGatewayEndpoint',
    });

    new cdk.CfnOutput(this, 'OidcProxyDiscoveryUrl', {
      value: this.oidcProxy.discoveryUrl,
      description: 'OIDC discovery URL (with PKCE) for MCP clients to authenticate',
    });

    new cdk.CfnOutput(this, 'McpClientConfig', {
      value: JSON.stringify(
        {
          mcpServers: {
            'guardian-demo-guardian': {
              url: this.gatewayEndpoint,
              transport: 'streamable-http',
            },
          },
        },
        null,
        2
      ),
      description: 'Paste into ~/.cursor/mcp.json or Claude Desktop config',
    });
  }
}
