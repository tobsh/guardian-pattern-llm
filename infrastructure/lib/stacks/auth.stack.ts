import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export type AuthStackProps = cdk.StackProps & {
  /** Cognito domain prefix — must be globally unique within the region. */
  readonly cognitoDomainPrefix?: string;
  /** Callback URLs for the web chat (Next.js). Localhost + future CloudFront. */
  readonly webCallbackUrls?: readonly string[];
  /** Logout URLs for the web chat. */
  readonly webLogoutUrls?: readonly string[];
};

/**
 * guardian-demo Cognito User Pool.
 *
 * Invite-only PoC — no self-signup. Users created via CLI:
 *   aws cognito-idp admin-create-user \
 *     --user-pool-id <pool-id> \
 *     --username <email> \
 *     --temporary-password '<temp>' \
 *     --user-attributes Name=email,Value=<email> Name=email_verified,Value=true
 *
 * Three app clients:
 *   - WebClient: Next.js SPA, authorization code + PKCE
 *   - McpClient: Cursor / Claude Desktop / MCP Inspector, localhost callbacks
 *   - CliClient: future CLI helper, localhost:9876
 *
 * All three back the same User Pool — one identity, multiple access surfaces.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly webClient: cognito.UserPoolClient;
  public readonly mcpClient: cognito.UserPoolClient;
  public readonly cliClient: cognito.UserPoolClient;
  public readonly cognitoDomain: string;

  constructor(scope: Construct, id: string, props: AuthStackProps = {}) {
    super(scope, id, props);

    const domainPrefix = props.cognitoDomainPrefix ?? `guardian-demo-${this.account}`;
    const webCallbackUrls = props.webCallbackUrls ?? ['http://localhost:3000/login/callback'];
    const webLogoutUrls = props.webLogoutUrls ?? ['http://localhost:3000'];

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'guardian-demo-users',

      // Invite-only for the PoC. Flip to true + add a verification template
      // before any real user touches this.
      selfSignUpEnabled: false,

      signInAliases: {
        email: true,
        username: false,
      },

      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },

      // OPTIONAL per issue #2 decision — PoC friction-free, flip to REQUIRED
      // before real users. TOTP only, no SMS (SMS-OTP is a known phishing vector).
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },

      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      autoVerify: { email: true },

      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },

      // PoC — easy teardown. Flip to true + RETAIN before any real user.
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: { domainPrefix },
    });
    this.cognitoDomain = `${domainPrefix}.auth.${this.region}.amazoncognito.com`;

    // ==========================================================================
    // Web client — Next.js SPA, PKCE flow
    // ==========================================================================
    this.webClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'guardian-demo-web-client',
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [...webCallbackUrls],
        logoutUrls: [...webLogoutUrls],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    // ==========================================================================
    // MCP client — Cursor, Claude Desktop, MCP Inspector
    // ==========================================================================
    const mcpCallbackUrls = [
      // Cursor IDE custom protocol
      'cursor://anysphere.cursor-mcp/oauth/guardian-demo-guardian/callback',
      'cursor://anysphere.cursor-mcp/oauth/callback',
      // Localhost callbacks for MCP Inspector + generic clients
      'http://localhost/callback',
      'http://localhost:6274/callback',
      'http://localhost:6274/oauth/callback',
      'http://localhost:8080/callback',
      'http://localhost:8888/callback',
      'http://localhost:9999/callback',
      'http://127.0.0.1/callback',
      'http://127.0.0.1:6274/callback',
      'http://127.0.0.1:8080/callback',
      'http://127.0.0.1:8888/callback',
      'http://127.0.0.1:9999/callback',
    ];

    this.mcpClient = this.userPool.addClient('McpClient', {
      userPoolClientName: 'guardian-demo-mcp-client',
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: mcpCallbackUrls,
        logoutUrls: ['http://localhost/', 'http://127.0.0.1/'],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    // ==========================================================================
    // CLI client — future `guardian-demo-chat-cli login` helper, localhost:9876
    // ==========================================================================
    this.cliClient = this.userPool.addClient('CliClient', {
      userPoolClientName: 'guardian-demo-cli-client',
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: ['http://localhost:9876/callback'],
        logoutUrls: ['http://localhost:9876'],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    // ==========================================================================
    // Outputs
    // ==========================================================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: 'GuardianDemoUserPoolId',
    });
    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      exportName: 'GuardianDemoUserPoolArn',
    });
    new cdk.CfnOutput(this, 'WebClientId', {
      value: this.webClient.userPoolClientId,
      exportName: 'GuardianDemoWebClientId',
    });
    new cdk.CfnOutput(this, 'McpClientId', {
      value: this.mcpClient.userPoolClientId,
      exportName: 'GuardianDemoMcpClientId',
    });
    new cdk.CfnOutput(this, 'CliClientId', {
      value: this.cliClient.userPoolClientId,
      exportName: 'GuardianDemoCliClientId',
    });
    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: this.cognitoDomain,
      description:
        'Hosted UI domain (append /login?client_id=...&redirect_uri=...&response_type=code)',
      exportName: 'GuardianDemoCognitoDomain',
    });
  }
}
