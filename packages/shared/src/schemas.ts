import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, '3–20 characters: lowercase letters, numbers, underscores');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email');

export const otpSchema = z.string().trim().regex(/^\d{6,10}$/, 'Enter the code from your email');

export const limitFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(50),
    kind: z.enum(['daily', 'session', 'downtime']),
    minutes: z.coerce.number().int().min(1).max(1440),
    strictness: z.enum(['relaxed', 'standard', 'strict', 'locked']),
    approvals_required: z.coerce.number().int().min(1).max(10),
    start_minute: z.number().int().min(0).max(1439).nullable().optional(),
    end_minute: z.number().int().min(0).max(1439).nullable().optional(),
  })
  .refine(
    (v) => v.kind !== 'downtime' || (v.start_minute != null && v.end_minute != null && v.start_minute !== v.end_minute),
    { message: 'Pick a start and end time', path: ['start_minute'] },
  );
export type LimitForm = z.infer<typeof limitFormSchema>;

export const requestFormSchema = z.object({
  limit_id: z.string().uuid().nullable(),
  minutes_requested: z.coerce.number().int().min(1).max(240),
  reason: z.string().trim().max(280).optional(),
});
export type RequestForm = z.infer<typeof requestFormSchema>;

export const voteSchema = z.object({
  decision: z.enum(['approve', 'deny']),
  comment: z.string().trim().max(280).optional(),
  /** Counter-offer: approve fewer minutes than requested. */
  minutes: z.coerce.number().int().min(1).max(240).optional(),
});
