'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  sendTurn,
  sendTurnBedrockGuardrails,
  sendTurnNoGuardrails,
  UnauthenticatedError,
  type TurnResponse,
  type BedrockGuardrailsTurnResponse,
  type NoGuardrailsTurnResponse,
} from '@/lib/api';
import { MessageBubble, formatUsd, type Message } from './MessageBubble';
import { signInWithRedirect } from 'aws-amplify/auth';

export type ChatPanelMode = 'guardian' | 'bedrock-guardrails' | 'no-guardrails';

export type ChatPanelHandle = {
  sendMessage: (text: string) => Promise<void>;
  isBusy: () => boolean;
};

type Props = {
  mode: ChatPanelMode;
  title: string;
  subtitle: string;
};

export const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  { mode, title, subtitle },
  ref
) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: `greeting-${mode}`,
      role: 'assistant',
      text: 'Hallo! Womit kann ich dir heute helfen?',
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [sessionCostUsd, setSessionCostUsd] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string): Promise<void> => {
    if (busy) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);

    try {
      let assistantMsg: Message;

      if (mode === 'guardian') {
        const result: TurnResponse = await sendTurn(text);
        assistantMsg = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: result.failedClosed
            ? 'Ich bin gerade kurz nicht verfügbar, bitte versuche es in einem Moment erneut.'
            : result.response,
          verdict: result.outputVerdict ?? result.inputVerdict,
          cost: result.cost,
        };
      } else if (mode === 'bedrock-guardrails') {
        const result: BedrockGuardrailsTurnResponse = await sendTurnBedrockGuardrails(text);
        assistantMsg = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: result.failedClosed
            ? 'Ich bin gerade kurz nicht verfügbar, bitte versuche es in einem Moment erneut.'
            : result.response,
          guardrailAction: result.guardrailAction,
          cost: result.cost,
        };
      } else {
        const result: NoGuardrailsTurnResponse = await sendTurnNoGuardrails(text);
        assistantMsg = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: result.failedClosed
            ? 'Ich bin gerade kurz nicht verfügbar, bitte versuche es in einem Moment erneut.'
            : result.response,
          cost: result.cost,
        };
      }

      setMessages((prev) => [...prev, assistantMsg]);
      setSessionCostUsd((prev) => prev + (assistantMsg.cost?.totalUsd ?? 0));
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
          text: 'Fehler bei der Anfrage. Bitte versuche es erneut.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(ref, () => ({
    sendMessage,
    isBusy: () => busy,
  }));

  return (
    <div className="flex min-h-0 h-full flex-col">
      <div className="border-b border-neutral-200 px-4 py-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-neutral-400">{subtitle}</div>
          {turnCount > 0 && (
            <div className="font-mono text-xs text-neutral-400">
              {formatUsd(sessionCostUsd)} · {turnCount} {turnCount === 1 ? 'Turn' : 'Turns'}
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} showVerdict={true} variant={mode} />
        ))}
        {busy && (
          <div className="my-2 flex justify-start">
            <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-400 shadow-sm">
              …
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </main>
    </div>
  );
});
