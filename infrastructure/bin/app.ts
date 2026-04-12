#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { AuthStack } from '../lib/stacks/auth.stack';
import { GuardianPocStack } from '../lib/stacks/guardian-poc.stack';
import { AgentCoreGatewayStack } from '../lib/stacks/agentcore-gateway.stack';
import { ChatWebStack } from '../lib/stacks/chat-web.stack';
import { GitHubOidcStack } from '../lib/stacks/github-oidc.stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
};

new GitHubOidcStack(app, 'GuardianDemoGitHubOidcStack', {
  env,
  githubOrg: 'tobsh',
  githubRepo: 'guardian-demo',
  allowedBranches: ['main'],
  allowedEnvironments: ['production'],
});

const authStack = new AuthStack(app, 'GuardianDemoAuthStack', {
  env,
});

const chatWebStack = new ChatWebStack(app, 'GuardianDemoChatWebStack', {
  env,
});

// Cross-stack: register the CloudFront domain as a valid OAuth callback
// on the Web client, and as a CORS origin on the Guardian API. Breaks
// the otherwise-circular Auth ↔ ChatWeb dependency by mutating the
// Web client's underlying CfnUserPoolClient after both stacks are
// defined.
const chatUrl = `https://${chatWebStack.distributionDomainName}`;
const webClientCfn = authStack.webClient.node.defaultChild as cognito.CfnUserPoolClient;
webClientCfn.callbackUrLs = ['http://localhost:3000/login/callback', `${chatUrl}/login/callback`];
webClientCfn.logoutUrLs = ['http://localhost:3000', chatUrl];
authStack.addDependency(chatWebStack);

const guardianStack = new GuardianPocStack(app, 'GuardianDemoGuardianPocStack', {
  env,
  guardianModelId: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
  coachModelId: 'eu.anthropic.claude-sonnet-4-6',
  userPool: authStack.userPool,
  allowedClientIds: [
    authStack.webClient.userPoolClientId,
    authStack.mcpClient.userPoolClientId,
    authStack.cliClient.userPoolClientId,
  ],
  extraCorsOrigins: [chatUrl],
});
guardianStack.addDependency(authStack);

const gatewayStack = new AgentCoreGatewayStack(app, 'GuardianDemoAgentCoreGatewayStack', {
  env,
  userPool: authStack.userPool,
  allowedClientIds: [authStack.mcpClient.userPoolClientId],
  registrationClientId: authStack.mcpClient.userPoolClientId,
  orchestratorFn: guardianStack.orchestratorFn,
});
gatewayStack.addDependency(authStack);
gatewayStack.addDependency(guardianStack);

// Apply PoC tags to every taggable resource in the app
cdk.Tags.of(app).add('project', 'guardian-demo');
cdk.Tags.of(app).add('component', 'guardian');
cdk.Tags.of(app).add('env', 'poc');
cdk.Tags.of(app).add('owner', 'tobsh');
