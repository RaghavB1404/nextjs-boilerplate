// lib/schema.ts
import { z } from "zod";

export const SlackAction = z.object({
  type: z.literal("slack"),
  channel: z.string(),           // for UI/spec display only
  template: z.string(),
});
export const Action = z.discriminatedUnion("type", [SlackAction]);
export type ActionT = z.infer<typeof Action>;

export const PDPAssertions = z.object({
  price: z.boolean().optional(),
  atc: z.boolean().optional(),
  textIncludes: z.string().optional(),
});

export const Condition = z.object({
  when: z.enum(["onFail","onPass"]),
  actions: z.array(Action).min(1),
});

export const PDPCheck = z.object({
  type: z.literal("pdpCheck"),
  name: z.string().default("PDP Check"),
  urls: z.array(z.string().url()).min(1).max(50),
  assertions: PDPAssertions,
  conditions: z.array(Condition).optional(), // branching
});

export const WorkflowSpec = z.object({
  name: z.string(),
  checks: z.array(PDPCheck).min(1),
  actions: z.array(Action).min(1),           // default actions (fallback)
  guardrails: z.object({
    timeoutSec: z.number().min(5).max(120).default(60),
    maxUrls: z.number().min(1).max(200).default(50),
  }),
  requireApproval: z.boolean().optional(),
  schedule: z.string().optional(),
});
export type WorkflowSpecT = z.infer<typeof WorkflowSpec>;

