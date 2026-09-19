import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { getEnv } from "../env";

let client: OpenAI | undefined;

/** Structured-output call: the model must return JSON matching `schema`. */
export async function generate<S extends z.ZodType>(opts: {
  schema: S;
  name: string;
  system: string;
  user: string;
  temperature?: number;
}): Promise<z.infer<S>> {
  const env = getEnv("OPENAI_API_KEY", "OPENAI_MODEL");
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const res = await client.chat.completions.parse({
    model: env.OPENAI_MODEL,
    temperature: opts.temperature,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: zodResponseFormat(opts.schema, opts.name),
  });

  const msg = res.choices[0]?.message;
  if (msg?.refusal) throw new Error(`Model refused: ${msg.refusal}`);
  if (!msg?.parsed) throw new Error("Model returned no parsed output");
  return msg.parsed as z.infer<S>;
}
