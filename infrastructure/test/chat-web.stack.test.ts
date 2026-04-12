import { describe, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ChatWebStack } from '../lib/stacks/chat-web.stack';

describe('ChatWebStack', () => {
  const app = new cdk.App();
  const stack = new ChatWebStack(app, 'TestChatWebStack', {
    env: { account: '123456789012', region: 'eu-central-1' },
  });
  cdk.Tags.of(app).add('project', 'guardian-demo');
  const template = Template.fromStack(stack);

  it('creates a private, versioned S3 bucket with SSE and BlockPublicAccess', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('creates a CloudFront distribution with index.html as the default root', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
      },
    });
  });

  it('creates the distribution with a 403/404 SPA fallback to /index.html', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CustomErrorResponses: [
          {
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          },
          {
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          },
        ],
      },
    });
  });

  it('uses Origin Access Control (not OAI) for S3 origin', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });
});
