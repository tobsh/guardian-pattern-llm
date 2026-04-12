import { describe, expect, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/stacks/auth.stack';

describe('AuthStack', () => {
  const app = new cdk.App();
  const stack = new AuthStack(app, 'TestAuthStack', {
    env: { account: '123456789012', region: 'eu-central-1' },
    cognitoDomainPrefix: 'guardian-demo-test',
  });
  const template = Template.fromStack(stack);

  it('creates a User Pool with self-signup disabled', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: Match.objectLike({ AllowAdminCreateUserOnly: true }),
    });
  });

  it('enforces a strong password policy', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: Match.objectLike({
          MinimumLength: 12,
          RequireLowercase: true,
          RequireUppercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        }),
      },
    });
  });

  it('configures MFA as OPTIONAL with TOTP only (no SMS)', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      MfaConfiguration: 'OPTIONAL',
      EnabledMfas: Match.arrayWith(['SOFTWARE_TOKEN_MFA']),
    });
  });

  it('creates three app clients (Web, Mcp, Cli)', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 3);
  });

  it('the Web client uses authorization code grant only (no implicit)', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'guardian-demo-web-client',
      AllowedOAuthFlows: ['code'],
    });
  });

  it('exposes a Cognito hosted UI domain', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'guardian-demo-test',
    });
  });
});
