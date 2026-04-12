'use client';

import { Amplify } from 'aws-amplify';
import { config } from './config';

let configured = false;

/**
 * Configure Amplify v6 for Cognito Hosted UI auth.
 * Idempotent — safe to call from multiple components during hydration.
 */
export function ensureAmplifyConfigured(): void {
  if (configured) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognito.userPoolId,
        userPoolClientId: config.cognito.userPoolClientId,
        loginWith: {
          oauth: {
            domain: config.cognito.domain,
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [`${config.chatUrl}/login/callback`],
            redirectSignOut: [config.chatUrl],
            responseType: 'code',
          },
        },
      },
    },
  });
  configured = true;
}
