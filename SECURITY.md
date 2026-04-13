# Security Policy

## Scope

This repository is a **proof of concept**, not a production system. Use it as a reference implementation or a starting point for your own deployment — don't run it as-is for real users.

## Reporting a vulnerability

If you find a security issue, please **do not open a public GitHub issue**. Instead, use GitHub's private vulnerability reporting:

**[Report a vulnerability](https://github.com/tobsh/guardian-pattern-llm/security/advisories/new)**

Please include:

- A description of the issue and its impact
- Steps to reproduce (minimal example preferred)
- Which commit or branch you tested against
- Any mitigation ideas you already have

I'll acknowledge the report within a few days and aim to ship a fix or mitigation as time allows. As a solo-maintained POC, there are no formal SLAs.

## What counts as in-scope

- Secrets or credentials leaked in the repo or build artifacts
- IAM policies in the CDK stacks that grant more access than the service needs
- Prompt-injection or jailbreak techniques that bypass the Guardian classifier and get the coach to give regulated advice
- Bugs in the constitution rendering / verdict schema that break the fail-closed contract
- Cognito / OAuth / API Gateway misconfigurations that expose the private `/turn` endpoints

## Out of scope

- Typos in German prompts
- Model hallucinations that are not regulated advice (this is a POC, not a safety-verified product)
- Cost overruns from your own deployment (tune the Lambda timeouts, memory, and Bedrock model choice for your workload)
- Bedrock model capacity or rate limits

## Rotating credentials

If you deployed this demo and suspect the AWS role or Cognito user pool was exposed, rotate:

1. Destroy the stack: `cd infrastructure && npx cdk destroy --all`
2. Rotate any AWS access keys you used for the deploy: AWS Console → IAM → Users → Security credentials
3. Redeploy from a clean commit

The demo stores no user data in durable storage beyond CloudWatch logs — there's nothing to exfiltrate after teardown.
