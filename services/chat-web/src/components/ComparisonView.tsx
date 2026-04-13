'use client';

import { useEffect, useRef, useState } from 'react';
import { signInWithRedirect, signOut, getCurrentUser } from 'aws-amplify/auth';
import { ensureAmplifyConfigured } from '@/lib/amplify';
import { ChatPanel, type ChatPanelHandle } from './ChatPanel';

type AuthState = 'unknown' | 'signed-out' | 'signed-in';

export function ComparisonView(): React.JSX.Element {
  const [authState, setAuthState] = useState<AuthState>('unknown');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const guardianRef = useRef<ChatPanelHandle>(null);
  const guardrailsRef = useRef<ChatPanelHandle>(null);
  const noGuardrailsRef = useRef<ChatPanelHandle>(null);

  useEffect(() => {
    ensureAmplifyConfigured();
    getCurrentUser()
      .then(() => setAuthState('signed-in'))
      .catch(() => setAuthState('signed-out'));
  }, []);

  useEffect(() => {
    if (authState === 'signed-out') {
      void signInWithRedirect();
    }
  }, [authState]);

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (!text || busy) return;

    setInput('');
    setBusy(true);

    // Fire all panels in parallel
    await Promise.allSettled([
      guardianRef.current?.sendMessage(text),
      guardrailsRef.current?.sendMessage(text),
      noGuardrailsRef.current?.sendMessage(text),
    ]);

    setBusy(false);
  }

  async function handleLogout(): Promise<void> {
    await signOut();
    setAuthState('signed-out');
  }

  if (authState !== 'signed-in') {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-500">
        {authState === 'unknown' ? 'Moment…' : 'Weiterleitung zur Anmeldung…'}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
        <div>
          <div className="text-lg font-semibold">Guardian Pattern — Vergleich</div>
          <div className="text-xs text-neutral-400">
            Gleiche Nachricht, drei Ansätze im Vergleich
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-neutral-500 hover:text-[var(--accent)]"
        >
          Abmelden
        </button>
      </header>

      {/* Triple panels */}
      <div className="grid flex-1 grid-cols-1 divide-x divide-neutral-200 overflow-hidden md:grid-cols-3">
        <ChatPanel
          ref={noGuardrailsRef}
          mode="no-guardrails"
          title="Ohne Guardrails"
          subtitle="Sonnet 4.6 ohne Schutzschicht"
        />
        <ChatPanel
          ref={guardrailsRef}
          mode="bedrock-guardrails"
          title="AWS Bedrock Guardrails"
          subtitle="Native Guardrails via Converse API"
        />
        <ChatPanel
          ref={guardianRef}
          mode="guardian"
          title="Guardian Pattern"
          subtitle="Constitutional Classifier (Haiku + Sonnet)"
        />
      </div>

      {/* Shared input */}
      <footer className="border-t border-neutral-200 px-6 py-4">
        <form
          className="mx-auto flex max-w-4xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nachricht an alle drei Chatbots…"
            disabled={busy}
            className="flex-1 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || input.trim() === ''}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? '…' : 'Senden'}
          </button>
        </form>
      </footer>
    </div>
  );
}
