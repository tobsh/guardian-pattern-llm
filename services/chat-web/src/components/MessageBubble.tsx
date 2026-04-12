'use client';

import type { GuardianOutput, TurnCost } from '@/lib/api';

export type Role = 'user' | 'assistant';

export type Message = {
  id: string;
  role: Role;
  text: string;
  // Guardian pattern fields
  verdict?: GuardianOutput | null;
  // Bedrock Guardrails fields
  guardrailAction?: 'NONE' | 'GUARDRAIL_INTERVENED';
  // Shared
  cost?: TurnCost;
};

type Props = {
  message: Message;
  showVerdict?: boolean;
  variant?: 'guardian' | 'bedrock-guardrails';
};

export const formatUsd = (usd: number): string => `$${usd.toFixed(4)}`;

const verdictColor = (verdict: string): string => {
  switch (verdict) {
    case 'pass':
      return 'text-green-600';
    case 'refuse':
      return 'text-red-600';
    case 'escalate':
      return 'text-orange-600';
    case 'sanitize':
      return 'text-yellow-600';
    default:
      return 'text-neutral-500';
  }
};

const guardrailActionColor = (action: string): string =>
  action === 'GUARDRAIL_INTERVENED' ? 'text-red-600' : 'text-green-600';

export function MessageBubble({
  message,
  showVerdict = false,
  variant = 'guardian',
}: Props): React.JSX.Element {
  const isUser = message.role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} my-2`}>
      <div
        className={`max-w-[90%] rounded-2xl px-4 py-3 leading-relaxed text-sm ${
          isUser
            ? 'bg-[var(--user-bubble)] text-[var(--foreground)]'
            : 'bg-[var(--assistant-bubble)] border border-neutral-200 text-[var(--foreground)] shadow-sm'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.text}</div>
        {!isUser && message.cost && (
          <div className="mt-2 border-t border-neutral-100 pt-1 text-xs text-neutral-400">
            <span className="font-mono">
              {formatUsd(message.cost.totalUsd)} · {message.cost.inputTokens}↑{' '}
              {message.cost.outputTokens}↓
            </span>
          </div>
        )}
        {showVerdict && !isUser && variant === 'guardian' && message.verdict && (
          <div className="mt-1 text-xs">
            <span className={`font-mono font-medium ${verdictColor(message.verdict.verdict)}`}>
              {message.verdict.verdict}
            </span>
            {message.verdict.categories.length > 0 && (
              <span className="font-mono text-neutral-400">
                {' '}
                · {message.verdict.categories.join(', ')}
              </span>
            )}
            <span className="font-mono text-neutral-400">
              {' '}
              · {message.verdict.confidence.toFixed(2)}
            </span>
          </div>
        )}
        {showVerdict && !isUser && variant === 'bedrock-guardrails' && message.guardrailAction && (
          <div className="mt-1 text-xs">
            <span
              className={`font-mono font-medium ${guardrailActionColor(message.guardrailAction)}`}
            >
              {message.guardrailAction === 'GUARDRAIL_INTERVENED' ? 'BLOCKED' : 'PASSED'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
