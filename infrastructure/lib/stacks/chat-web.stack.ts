import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';

export type ChatWebStackProps = cdk.StackProps;

/**
 * Static hosting for the guardian-demo chat web app.
 *
 * Architecture:
 *   Browser → CloudFront (HTTPS, HTTP/2) → S3 (private, OAC)
 *
 * - S3 bucket is PRIVATE (BlockPublicAccess.BLOCK_ALL). Only CloudFront
 *   can read, via Origin Access Control (OAC — the modern replacement
 *   for OAI). Direct S3 URLs return 403.
 * - CloudFront default root object = index.html
 * - SPA fallback: 404 → /index.html with 200 (Next.js App Router client
 *   routing needs all unknown paths to serve index.html)
 * - No custom domain for the PoC — use the default *.cloudfront.net URL
 *   and the ACM cert that comes with it
 * - BucketDeployment reads `services/chat-web/out/` which must exist
 *   before `cdk deploy`. CI runs `pnpm --filter @guardian-demo/chat-web build`
 *   before synth; locally run `pnpm chat:build` first.
 */
export class ChatWebStack extends cdk.Stack {
  public readonly distributionDomainName: string;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ChatWebStackProps = {}) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'ChatWebBucket', {
      bucketName: `guardian-demo-chat-web-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'ChatWebDistribution', {
      comment: 'guardian-demo chat web PoC',
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      // SPA fallback: route all app paths through index.html.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(10),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(10),
        },
      ],
    });
    this.distributionDomainName = distribution.distributionDomainName;

    // Only attempt to upload assets if the Next.js build output exists.
    // This lets `cdk synth` succeed in CI before the build step runs and
    // lets unit tests pass without a preceding build. The deploy
    // workflow always builds first.
    const buildOutputPath = path.join(__dirname, '../../../services/chat-web/out');
    if (fs.existsSync(buildOutputPath)) {
      new s3deploy.BucketDeployment(this, 'ChatWebDeployment', {
        sources: [s3deploy.Source.asset(buildOutputPath)],
        destinationBucket: this.bucket,
        distribution,
        distributionPaths: ['/*'],
      });
    }

    new cdk.CfnOutput(this, 'ChatUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Public CloudFront URL for the chat frontend',
      exportName: 'GuardianDemoChatUrl',
    });
    new cdk.CfnOutput(this, 'ChatBucketName', {
      value: this.bucket.bucketName,
    });
  }
}
