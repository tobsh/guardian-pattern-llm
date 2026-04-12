import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export type OidcProxyProps = {
  /** The original Cognito OIDC discovery URL to proxy */
  readonly cognitoDiscoveryUrl: string;
  /**
   * Pre-configured Cognito App Client ID returned from the fake dynamic
   * client registration endpoint. MCP clients call `/register` per
   * RFC 7591; Cognito doesn't support dynamic registration natively, so
   * we echo this client ID back instead.
   */
  readonly clientId: string;
  /**
   * Allowed redirect URI patterns for the fake registration endpoint.
   * Supports wildcards (`http://localhost:*\/*`). localhost patterns are
   * always included. Pass additional patterns for third-party MCP clients.
   */
  readonly allowedRedirectUriPatterns?: readonly string[];
  /** Name prefix for Lambda + API resources. */
  readonly namePrefix?: string;
};

/**
 * OIDC Discovery Proxy for Cognito → MCP compatibility.
 *
 * Two Lambdas fronted by a tiny REST API:
 *   GET  /.well-known/openid-configuration
 *     Fetches Cognito's discovery doc and adds the two fields MCP clients
 *     require but Cognito doesn't advertise:
 *       - code_challenge_methods_supported: ["S256"]  (PKCE)
 *       - registration_endpoint (points at /register below)
 *
 *   POST /register
 *     RFC 7591 dynamic client registration stub. Validates redirect_uris
 *     against a whitelist, then echoes back the pre-configured Cognito
 *     client ID. Everyone gets the same client — it's a trust-the-gateway
 *     model, security comes from Cognito + the JWT on every downstream call.
 *
 * Patterns copied from ibkr-flexsync; the regex + whitelist logic is
 * self-contained in the Lambda code string so no esbuild bundling is needed.
 */
export class OidcProxy extends Construct {
  public readonly discoveryUrl: string;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: OidcProxyProps) {
    super(scope, id);

    const namePrefix = props.namePrefix ?? 'oidc-proxy';

    const discoveryLogGroup = new logs.LogGroup(this, 'DiscoveryLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const discoveryFunction = new lambda.Function(this, 'DiscoveryFunction', {
      functionName: `${namePrefix}-discovery`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const https = require('https');

exports.handler = async (event) => {
  const cognitoUrl = process.env.COGNITO_DISCOVERY_URL;
  const host = event.headers?.Host || event.headers?.host || '';
  const stage = event.requestContext?.stage || 'v1';
  const registrationEndpoint = \`https://\${host}/\${stage}/register\`;

  try {
    const response = await new Promise((resolve, reject) => {
      https.get(cognitoUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        res.on('error', reject);
      }).on('error', reject);
    });

    if (response.statusCode !== 200) {
      return {
        statusCode: response.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch discovery document' }),
      };
    }

    const discovery = JSON.parse(response.body);
    discovery.code_challenge_methods_supported = ['S256'];
    discovery.registration_endpoint = registrationEndpoint;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(discovery),
    };
  } catch (error) {
    console.error('Error proxying OIDC discovery:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
`),
      environment: {
        COGNITO_DISCOVERY_URL: props.cognitoDiscoveryUrl,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      logGroup: discoveryLogGroup,
      description: 'Proxies Cognito OIDC discovery and adds MCP-required fields',
    });

    const defaultAllowedPatterns = [
      'http://localhost/*',
      'http://localhost:*/*',
      'http://127.0.0.1/*',
      'http://127.0.0.1:*/*',
      'cursor://*',
    ];
    const allowedPatterns = props.allowedRedirectUriPatterns
      ? [...defaultAllowedPatterns, ...props.allowedRedirectUriPatterns]
      : defaultAllowedPatterns;

    const regexSpecialChars = '.+?^${}()|[]\\\\';
    const registrationCode = `
const ALLOWED_PATTERNS = ${JSON.stringify(allowedPatterns)};

const patternToRegex = (pattern) => {
  const specialChars = '${regexSpecialChars}';
  let escaped = '';
  for (const char of pattern) {
    if (specialChars.includes(char)) {
      escaped += String.fromCharCode(92) + char;
    } else if (char === '*') {
      escaped += '.*';
    } else {
      escaped += char;
    }
  }
  return new RegExp('^' + escaped + '$');
};

const isUriAllowed = (uri) => {
  return ALLOWED_PATTERNS.some(pattern => patternToRegex(pattern).test(uri));
};

exports.handler = async (event) => {
  const clientId = process.env.CLIENT_ID;
  const sourceIp = event.requestContext?.identity?.sourceIp || 'unknown';
  const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || 'unknown';

  let requestBody = {};
  try {
    if (event.body) {
      requestBody = JSON.parse(event.isBase64Encoded ?
        Buffer.from(event.body, 'base64').toString() : event.body);
    }
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_client_metadata', error_description: 'Invalid JSON' }),
    };
  }

  console.log(JSON.stringify({
    event: 'client_registration_attempt',
    sourceIp,
    userAgent,
    clientName: requestBody.client_name || null,
    redirectUris: requestBody.redirect_uris || [],
  }));

  const requestedUris = requestBody.redirect_uris || ['http://localhost/callback'];
  const invalidUris = requestedUris.filter(uri => !isUriAllowed(uri));

  if (invalidUris.length > 0) {
    console.warn(JSON.stringify({
      event: 'client_registration_rejected',
      sourceIp,
      invalidUris,
      allowedPatterns: ALLOWED_PATTERNS,
    }));
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'invalid_redirect_uri',
        error_description: 'One or more redirect_uris are not allowed: ' + invalidUris.join(', '),
      }),
    };
  }

  const response = {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    redirect_uris: requestedUris,
    client_name: requestBody.client_name || 'MCP Client',
    ...(requestBody.software_id && { software_id: requestBody.software_id }),
    ...(requestBody.software_version && { software_version: requestBody.software_version }),
  };

  return {
    statusCode: 201,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(response),
  };
};
`;

    const registrationLogGroup = new logs.LogGroup(this, 'RegistrationLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const registrationFunction = new lambda.Function(this, 'RegistrationFunction', {
      functionName: `${namePrefix}-register`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(registrationCode),
      environment: {
        CLIENT_ID: props.clientId,
      },
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      logGroup: registrationLogGroup,
      description: 'RFC 7591 dynamic client registration stub for MCP clients',
    });

    this.api = new apigateway.RestApi(this, 'ProxyApi', {
      restApiName: `${namePrefix}-api`,
      description: 'OIDC Discovery Proxy — adds MCP-required fields to Cognito discovery',
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const wellKnown = this.api.root.addResource('.well-known');
    const openidConfig = wellKnown.addResource('openid-configuration');
    const register = this.api.root.addResource('register');

    openidConfig.addMethod('GET', new apigateway.LambdaIntegration(discoveryFunction));
    register.addMethod('POST', new apigateway.LambdaIntegration(registrationFunction));

    this.discoveryUrl = `${this.api.url}.well-known/openid-configuration`;

    new cdk.CfnOutput(this, 'ProxyDiscoveryUrl', {
      value: this.discoveryUrl,
      description: 'OIDC Discovery URL with PKCE support (use this instead of Cognito URL)',
    });
  }
}
