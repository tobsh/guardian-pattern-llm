'use client';

import { useEffect, useRef, useState } from 'react';
import { signInWithRedirect, signOut, getCurrentUser } from 'aws-amplify/auth';
import { ensureAmplifyConfigured } from '@/lib/amplify';
import { sendTurn, UnauthenticatedError } from '@/lib/api';
import { MessageBubble, formatUsd, type Message } from './MessageBubble';

type AuthState = 'unknown' | 'signed-out' | 'signed-in';

// Persona is hardcoded for the PoC — the Persona Setup Agent (TM-ARCH-003 §2)
// lands in a follow-up issue. When it ships, these values come from the
// persona.yaml in the User Profile Store.
const PERSONA = {
  assistantName: 'Finanz-Coach',
  displayName: 'Coach',
} as const;

const showVerdict = process.env.NEXT_PUBLIC_SHOW_VERDICT === 'true';

export function ChatThread(): React.JSX.Element {
  const [authState, setAuthState] = useState<AuthState>('unknown');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'greeting',
      role: 'assistant',
      text: `Hallo ${PERSONA.displayName}! Womit kann ich dir heute helfen?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionCostUsd, setSessionCostUsd] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Boot: configure Amplify then probe current auth state
  useEffect(() => {
    ensureAmplifyConfigured();
    getCurrentUser()
      .then(() => {
        setAuthState('signed-in');
      })
      .catch(() => {
        setAuthState('signed-out');
      });
  }, []);

  // Auto-redirect on first render if not signed in
  useEffect(() => {
    if (authState === 'signed-out') {
      void signInWithRedirect();
    }
  }, [authState]);

  // Scroll to the newest message whenever the thread grows
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    try {
      const result = await sendTurn(text);
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: result.failedClosed
          ? 'Ich bin gerade kurz nicht verfügbar, bitte versuche es in einem Moment erneut.'
          : result.response,
        verdict: result.outputVerdict ?? result.inputVerdict,
        cost: result.cost,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setSessionCostUsd((prev) => prev + result.cost.totalUsd);
      setTurnCount((prev) => prev + 1);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        await signInWithRedirect();
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: 'Ich konnte dich gerade nicht erreichen. Magst du es noch einmal versuchen?',
        },
      ]);
    } finally {
      setBusy(false);
    }
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
    <div className="mx-auto flex h-screen max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between border-b border-neutral-200 py-4">
        <div>
          <div className="text-lg font-semibold">
            {PERSONA.assistantName} · mit {PERSONA.displayName}
          </div>
          <div className="text-xs text-neutral-500">Finanz-Coach (PoC)</div>
        </div>
        <div className="flex items-center gap-4">
          {turnCount > 0 && (
            <div
              className="text-right font-mono text-xs text-neutral-500"
              title={`Live-Kosten dieser Session (${String(turnCount)} Turns). Preise approximiert — tatsächliche Abrechnung über AWS Bedrock.`}
            >
              <div>{formatUsd(sessionCostUsd)}</div>
              <div>
                {turnCount} {turnCount === 1 ? 'Turn' : 'Turns'}
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-neutral-500 hover:text-[var(--accent)]"
          >
            Abmelden
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto py-4" aria-live="polite">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} showVerdict={showVerdict} />
        ))}
        <div ref={threadEndRef} />
      </main>

      <footer className="border-t border-neutral-200 py-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
            }}
            placeholder={`Nachricht an ${PERSONA.assistantName}…`}
            disabled={busy}
            className="flex-1 rounded-full border border-neutral-300 bg-white px-4 py-2 focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || input.trim() === ''}
            className="rounded-full bg-[var(--accent)] px-5 py-2 font-medium text-white disabled:opacity-40"
          >
            {busy ? '…' : 'Senden'}
          </button>
        </form>
      </footer>
    </div>
  );
}
