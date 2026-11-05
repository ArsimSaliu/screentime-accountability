import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, '3–20 characters: lowercase letters, numbers, underscores');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email');

export const otpSchema = z.string().trim().regex(/^\d{6,10}$/, 'Enter the code from your email');

export const limitFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50),
  kind: z.enum(['daily', 'session']),
  minutes: z.coerce.number().int().min(1).max(1440),
  strictness: z.enum(['relaxed', 'standard', 'strict', 'locked']),
  approvals_required: z.coerce.number().int().min(1).max(10),
});
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
});
