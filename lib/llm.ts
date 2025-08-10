import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { WorkflowSpec } from "./schema";

const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const modelName = process.env.LLM_MODEL || "openai/gpt-oss-20b:free";

const openai = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL, // point OpenAI provider to OpenRouter
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
      maxRetries: 0,
    });
    return { spec: object, repaired: false };
  } catch (err1) {
    // One repair attempt: ask the model to fix the previous failure
    const repairSchema = z.object({ fixed: WorkflowSpec });
    const { object } = await generateObject({
      model: openai(modelName),
      schema: repairSchema,
      system,
      prompt: `The previous attempt failed schema validation. Produce a corrected JSON under the key "fixed". Original request:\n${prompt}`,
      maxRetries: 0,
    });
    return { spec: object.fixed, repaired: true };
  }
}
