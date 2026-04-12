/**
 * Build-time config injected by CI from CloudFormation stack outputs.
 *
 * IMPORTANT: Next.js only inlines `NEXT_PUBLIC_*` vars at build time when
 * they are accessed as *static property references* (e.g.
 * `process.env.NEXT_PUBLIC_FOO`). Dynamic access like `process.env[name]`
 * is NOT inlined — it resolves to `undefined` in the browser bundle and
 * then throws at first render. That's why every var below is read as a
 * literal property, not through a helper. Do not "DRY this up" with a
 * loop — it will break again.
 *
 * Required env vars (all set by the Deploy workflow):
 *   NEXT_PUBLIC_COGNITO_REGION
 *   NEXT_PUBLIC_COGNITO_USER_POOL_ID
 *   NEXT_PUBLIC_COGNITO_CLIENT_ID     (WebClient ID)
 *   NEXT_PUBLIC_COGNITO_DOMAIN
 *   NEXT_PUBLIC_API_URL
 *   NEXT_PUBLIC_CHAT_URL
 *
 * Optional:
 *   NEXT_PUBLIC_SHOW_VERDICT          ('true' to render verdict panel)
 */

const region = process.env.NEXT_PUBLIC_COGNITO_REGION ?? '';
const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '';
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '';
const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? '';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
const chatUrl = process.env.NEXT_PUBLIC_CHAT_URL ?? '';

const missing: string[] = [];
if (!region) missing.push('NEXT_PUBLIC_COGNITO_REGION');
if (!userPoolId) missing.push('NEXT_PUBLIC_COGNITO_USER_POOL_ID');
if (!userPoolClientId) missing.push('NEXT_PUBLIC_COGNITO_CLIENT_ID');
if (!cognitoDomain) missing.push('NEXT_PUBLIC_COGNITO_DOMAIN');
if (!apiUrl) missing.push('NEXT_PUBLIC_API_URL');
if (!chatUrl) missing.push('NEXT_PUBLIC_CHAT_URL');
if (missing.length > 0) {
  // Surface a single clear error at module load instead of silently
  // having half-configured Amplify + mystery fetch failures later.
  throw new Error(`Missing required env vars at build time: ${missing.join(', ')}`);
}

export const config = {
  cognito: {
    region,
    userPoolId,
    userPoolClientId,
    domain: cognitoDomain,
  },
  apiUrl,
  chatUrl,
} as const;
