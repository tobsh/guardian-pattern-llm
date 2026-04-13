import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble, formatUsd, type Message } from './MessageBubble';

const userMessage: Message = { id: '1', role: 'user', text: 'Wie stelle ich ein Budget auf?' };
const assistantMessage: Message = {
  id: '2',
  role: 'assistant',
  text: 'Das ist ein guter Anfang.',
  verdict: {
    verdict: 'pass',
    categories: ['budgetplanung'],
    flags: {
      prompt_injection: 0,
      red_flag_risk: 0,
      profanity: 0,
      off_topic_regulated: 0,
      pii_leak_attempt: 0,
    },
    confidence: 0.97,
    notes: '',
  },
  cost: {
    totalUsd: 0.0142,
    inputTokens: 1700,
    outputTokens: 580,
    breakdown: [],
  },
};

describe('<MessageBubble />', () => {
  it('renders user message text', () => {
    render(<MessageBubble message={userMessage} />);
    expect(screen.getByText(/Wie stelle ich ein Budget auf/)).toBeInTheDocument();
  });

  it('renders assistant text', () => {
    render(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText('Das ist ein guter Anfang.')).toBeInTheDocument();
  });

  it('shows the verdict panel only when showVerdict=true and role=assistant', () => {
    const { rerender } = render(<MessageBubble message={assistantMessage} showVerdict={false} />);
    expect(screen.queryByText('pass')).not.toBeInTheDocument();

    rerender(<MessageBubble message={assistantMessage} showVerdict={true} />);
    expect(screen.getByText('pass')).toBeInTheDocument();
    expect(screen.getByText(/budgetplanung/)).toBeInTheDocument();
  });

  it('does not render verdict panel for user messages even with showVerdict', () => {
    render(<MessageBubble message={userMessage} showVerdict={true} />);
    expect(screen.queryByText('pass')).not.toBeInTheDocument();
  });

  it('renders BLOCKED badge for bedrock-guardrails variant when guardrail intervened', () => {
    const blocked: Message = {
      ...assistantMessage,
      verdict: null,
      guardrailAction: 'GUARDRAIL_INTERVENED',
    };
    render(<MessageBubble message={blocked} showVerdict variant="bedrock-guardrails" />);
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
  });

  it('renders PASSED badge for bedrock-guardrails variant when guardrail did not intervene', () => {
    const passed: Message = {
      ...assistantMessage,
      verdict: null,
      guardrailAction: 'NONE',
    };
    render(<MessageBubble message={passed} showVerdict variant="bedrock-guardrails" />);
    expect(screen.getByText('PASSED')).toBeInTheDocument();
  });

  it('renders UNGUARDED badge for no-guardrails variant', () => {
    render(
      <MessageBubble
        message={{ ...assistantMessage, verdict: null }}
        showVerdict
        variant="no-guardrails"
      />
    );
    expect(screen.getByText('UNGUARDED')).toBeInTheDocument();
  });

  it('renders cost + token breakdown on assistant messages', () => {
    render(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText(/\$0\.0142/)).toBeInTheDocument();
    expect(screen.getByText(/1700↑/)).toBeInTheDocument();
    expect(screen.getByText(/580↓/)).toBeInTheDocument();
  });

  it('does not render cost for user messages', () => {
    render(<MessageBubble message={{ ...userMessage, cost: assistantMessage.cost }} />);
    expect(screen.queryByText(/\$0\.0142/)).not.toBeInTheDocument();
  });
});

describe('formatUsd', () => {
  it('formats to 4 decimal places with $ prefix', () => {
    expect(formatUsd(0.01234)).toBe('$0.0123');
    expect(formatUsd(0)).toBe('$0.0000');
    expect(formatUsd(1.5)).toBe('$1.5000');
  });
});
