import { z } from 'zod';

export const GuardianVerdict = z.enum(['pass', 'refuse', 'escalate', 'sanitize']);
export type GuardianVerdict = z.infer<typeof GuardianVerdict>;

export const GuardianFlags = z.object({
  prompt_injection: z.number().min(0).max(1),
  red_flag_risk: z.number().min(0).max(1),
  profanity: z.number().min(0).max(1),
  off_topic_regulated: z.number().min(0).max(1),
  pii_leak_attempt: z.number().min(0).max(1),
});
export type GuardianFlags = z.infer<typeof GuardianFlags>;

export const GuardianOutput = z.object({
  verdict: GuardianVerdict,
  categories: z.array(z.string()),
  flags: GuardianFlags,
  confidence: z.number().min(0).max(1),
  notes: z.string(),
});
export type GuardianOutput = z.infer<typeof GuardianOutput>;

export const FAIL_CLOSED: GuardianOutput = {
  verdict: 'refuse',
  categories: ['system_unavailable'],
  flags: {
    prompt_injection: 0,
    red_flag_risk: 0,
    profanity: 0,
    off_topic_regulated: 0,
    pii_leak_attempt: 0,
  },
  confidence: 1,
  notes: 'Guardian unavailable — fail closed',
};

export const FAIL_CLOSED_TEMPLATE =
  'Ich bin gerade kurz nicht verfügbar, bitte versuche es in einem Moment erneut.';
