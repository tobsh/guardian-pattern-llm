import { describe, expect, it } from 'vitest';
import { type Constitution, renderSystemPrompt } from './constitution.js';

const base: Constitution = {
  schema_version: 1,
  phase: 'input',
  role: 'You are the Guardian.',
  allowed_categories: [
    { name: 'budgetplanung', description: 'Monatsbudget, Ausgaben-Tracking' },
    { name: 'sparen', description: 'Notgroschen, Strategien' },
  ],
  forbidden_categories: [
    { name: 'anlageberatung', description: 'Konkrete Kauf-/Verkaufsempfehlungen' },
  ],
  red_flags: ['Spielsucht', 'Suizid'],
  routing_rules: 'pass allowed, refuse forbidden, escalate red flags',
};

describe('renderSystemPrompt', () => {
  it('includes role, categories, red flags, routing rules, and input tag instruction', () => {
    const prompt = renderSystemPrompt(base);
    expect(prompt).toContain('You are the Guardian.');
    expect(prompt).toContain('- budgetplanung: Monatsbudget, Ausgaben-Tracking');
    expect(prompt).toContain('- anlageberatung: Konkrete Kauf-/Verkaufsempfehlungen');
    expect(prompt).toContain('- Spielsucht');
    expect(prompt).toContain('pass allowed, refuse forbidden, escalate red flags');
    expect(prompt).toContain('<user_input>');
    expect(prompt).toContain('`report_verdict`');
  });

  it('uses <coach_output> tag for the output phase', () => {
    const prompt = renderSystemPrompt({ ...base, phase: 'output' });
    expect(prompt).toContain('<coach_output>');
    expect(prompt).not.toContain('<user_input>');
  });

  it('renders "(keine)" when red_flags is empty', () => {
    const prompt = renderSystemPrompt({ ...base, red_flags: [] });
    expect(prompt).toContain('(keine)');
  });

  it('includes output_rules section when provided', () => {
    const prompt = renderSystemPrompt({
      ...base,
      output_rules: ['Every fact must cite a source.'],
    });
    expect(prompt).toContain('## Output-Regeln');
    expect(prompt).toContain('- Every fact must cite a source.');
  });

  it('omits output_rules section when not provided', () => {
    const prompt = renderSystemPrompt(base);
    expect(prompt).not.toContain('## Output-Regeln');
  });
});
