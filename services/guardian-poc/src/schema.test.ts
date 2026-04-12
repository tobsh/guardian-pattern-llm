import { describe, expect, it } from 'vitest';
import { FAIL_CLOSED, GuardianOutput } from './schema.js';

describe('GuardianOutput schema', () => {
  it('accepts a valid pass verdict', () => {
    const result = GuardianOutput.safeParse({
      verdict: 'pass',
      categories: ['budgetplanung', 'ontopic'],
      flags: {
        prompt_injection: 0.02,
        red_flag_risk: 0,
        profanity: 0,
        off_topic_regulated: 0,
        pii_leak_attempt: 0,
      },
      confidence: 0.97,
      notes: 'standard coaching turn',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown verdict', () => {
    const result = GuardianOutput.safeParse({
      verdict: 'maybe',
      categories: [],
      flags: {
        prompt_injection: 0,
        red_flag_risk: 0,
        profanity: 0,
        off_topic_regulated: 0,
        pii_leak_attempt: 0,
      },
      confidence: 0.5,
      notes: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects flags outside [0, 1]', () => {
    const result = GuardianOutput.safeParse({
      verdict: 'pass',
      categories: [],
      flags: {
        prompt_injection: 1.5,
        red_flag_risk: 0,
        profanity: 0,
        off_topic_regulated: 0,
        pii_leak_attempt: 0,
      },
      confidence: 0.9,
      notes: '',
    });
    expect(result.success).toBe(false);
  });

  it('FAIL_CLOSED is a valid GuardianOutput', () => {
    expect(GuardianOutput.safeParse(FAIL_CLOSED).success).toBe(true);
  });
});
