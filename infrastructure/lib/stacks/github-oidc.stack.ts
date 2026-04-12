import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export type GitHubOidcStackProps = cdk.StackProps & {
  readonly githubOrg: string;
  readonly githubRepo: string;
  readonly allowedBranches?: readonly string[];
  readonly allowedEnvironments?: readonly string[];
};

/**
 * Creates the GitHub OIDC provider + deploy role that CI assumes.
 * Deploy once manually before enabling CI/CD: `cdk deploy GuardianDemoGitHubOidcStack`.
 * Exports DeployRoleArn → set as AWS_DEPLOY_ROLE_ARN secret in GitHub.
 */
export class GitHubOidcStack extends cdk.Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubOidcStackProps) {
    super(scope, id, props);

    const { githubOrg, githubRepo, allowedBranches = ['main'], allowedEnvironments = [] } = props;

    // Import the existing account-wide GitHub OIDC provider. AWS only allows
    // one provider per URL per account, and another stack (ibkr-flexsync)
    // already created it. We reference it here instead of recreating.
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubOidcProvider',
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
    );

    // When a workflow job uses `environment: <name>`, GitHub's OIDC token
    // swaps the sub claim from `ref:refs/heads/...` to `environment:<name>`.
    // Trust both so branch-scoped and environment-scoped jobs can assume.
    const branchSubs = allowedBranches.map(
      (branch) => `repo:${githubOrg}/${githubRepo}:ref:refs/heads/${branch}`
    );
    const envSubs = allowedEnvironments.map(
      (env) => `repo:${githubOrg}/${githubRepo}:environment:${env}`
    );
    const subClaims = [...branchSubs, ...envSubs];

    this.deployRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      roleName: 'GuardianDemoGitHubActionsDeployRole',
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': subClaims,
        },
      }),
      description: `GitHub Actions deploy role for ${githubOrg}/${githubRepo}`,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Least-privilege: only allow assuming CDK bootstrap roles.
    // CDK bootstrap roles hold the actual deploy permissions.
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      })
    );

    // Read CloudFormation stack outputs (used by the deploy workflow to
    // source Cognito pool/client IDs + API URL for the chat-web build).
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DescribeGuardianDemoStacks',
        effect: iam.Effect.ALLOW,
        actions: ['cloudformation:DescribeStacks'],
        resources: [`arn:aws:cloudformation:${this.region}:${this.account}:stack/GuardianDemo*`],
      })
    );

    // Upload chat-web static export to S3 + invalidate CloudFront.
    // Scoped to the guardian-demo-chat-web bucket and all distributions
    // (list/invalidate don't support resource-level permissions).
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SyncChatWebBucket',
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
        resources: [
          `arn:aws:s3:::guardian-demo-chat-web-${this.account}`,
          `arn:aws:s3:::guardian-demo-chat-web-${this.account}/*`,
        ],
      })
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvalidateCloudFront',
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudfront:ListDistributions',
          'cloudfront:CreateInvalidation',
          'cloudfront:GetDistribution',
        ],
        resources: ['*'],
      })
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description: 'Set as AWS_DEPLOY_ROLE_ARN secret in GitHub',
      exportName: 'GuardianDemoDeployRoleArn',
    });
  }
}
