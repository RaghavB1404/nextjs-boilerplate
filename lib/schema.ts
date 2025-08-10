import { z } from "zod";

export const Assertions = z.object({
  price: z.boolean().optional(),
  atc: z.boolean().optional(),
  textIncludes: z.string().min(1).optional(),
}).refine(a => !!(a.price || a.atc || a.textIncludes), {
  message: "At least one assertion (price/atc/textIncludes) is required"
});

export const Check = z.object({
  type: z.literal("pdpCheck"),
  urls: z.array(z.string().url()).min(1).max(Number(process.env.MAX_URLS || 50)),
  assertions: Assertions,
});

export const ActionSlack = z.object({
  type: z.literal("slack"),
  channel: z.string().default("#ops-alerts"),
  template: z.string().min(3),
});

export const ActionEmail = z.object({
  type: z.literal("email"),
  to: z.string().email(),
  subject: z.string().min(3),
  body: z.string().min(3),
});

export const WorkflowSpec = z.object({
  name: z.string().min(3).max(80),
  schedule: z.object({ cron: z.string().regex(/^[\*\d,\-\/ ]+$/) }).optional(),
  checks: z.array(Check).min(1),
  actions: z.array(z.union([ActionSlack, ActionEmail])).min(1),
  guardrails: z.object({
    timeoutSec: z.number().int().min(5).max(60).default(Number(process.env.SIM_TIMEOUT_SEC || 60)),
    maxUrls: z.number().int().min(1).max(Number(process.env.MAX_URLS || 50)).default(Number(process.env.MAX_URLS || 50)),
  }).default({})
});

export type WorkflowSpecT = z.infer<typeof WorkflowSpec>;
