import { generateObject } from "ai";
import { createOpenAI } from "ai/openai";
import { z } from "zod";
import { WorkflowSpec } from "./schema";

const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const modelName = process.env.LLM_MODEL || "openai/gpt-4o-mini";

const openai = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,  // OpenRouter key
  baseURL,                                  // point OpenAI provider to OpenRouter
});

export async function compileToSpec(prompt: string) {
  const system = `You compile natural-language requests into a JSON workflow for ecommerce ops.
Return ONLY valid JSON adhering to the provided schema. No prose, no comments.`;

  // First attempt
  try {
    const { object } = await generateObject({
      model: openai(modelName),
      schema: WorkflowSpec,
      system,
      prompt,
      maxRetries: 0,          // single-model, no automatic retries
    });
    return { spec: object, repaired: false };
  } catch {
    // One repair attempt: wrap in an object and ask for fixed JSON
    const Repair = z.object({ fixed: WorkflowSpec });
    const { object } = await generateObject({
      model: openai(modelName),
      schema: Repair,
      system,
      prompt:
        `The previous attempt failed schema validation. Produce corrected JSON under key "fixed".\nOriginal request:\n${prompt}`,
      maxRetries: 0,
    });
    return { spec: object.fixed, repaired: true };
  }
}
