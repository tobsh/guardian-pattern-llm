'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ensureAmplifyConfigured } from '@/lib/amplify';
import { getCurrentUser } from 'aws-amplify/auth';

/**
 * OAuth callback page.
 *
 * Amplify's Hub listener auto-completes the authorization code exchange
 * when it sees `?code=...` in the URL after `ensureAmplifyConfigured()`
 * runs. We poll briefly for `getCurrentUser` success, then redirect home.
 * On failure or timeout we also bounce to `/` which will re-trigger
 * sign-in — robust against stale or tampered redirects.
 */
export default function LoginCallback(): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    ensureAmplifyConfigured();
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      getCurrentUser()
        .then(() => {
          clearInterval(interval);
          router.replace('/');
        })
        .catch(() => {
          if (attempts >= 20) {
            clearInterval(interval);
            router.replace('/');
          }
        });
    }, 250);
    return () => {
      clearInterval(interval);
    };
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center text-neutral-500">Anmelden…</div>
  );
}
