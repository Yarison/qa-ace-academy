import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createGeminiProvider } from "@/lib/ai-gateway.server";

const InputSchema = z.object({
  jobDescription: z.string().trim().min(20).max(8000),
  category: z.enum(["api", "sql", "playwright"]),
  questions: z
    .array(z.object({ id: z.string(), question: z.string() }))
    .min(1)
    .max(40),
});

export const tailorQuestions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");

    const gateway = createGeminiProvider(key);
    const list = data.questions
      .map((q, i) => `${i + 1}. [${q.id}] ${q.question}`)
      .join("\n");

    const result = await generateText({
      model: gateway("gemini-2.0-flash"),
      system: `You are a QA hiring manager tailoring interview prep to a specific job description.
For each question, rewrite it so the candidate must answer in the context of the responsibilities, tools, and domain in the JD.
Keep the original technical intent. Be concise — one sentence per question. Don't invent technologies absent from the JD.`,
      prompt: `Category: ${data.category}\n\nJob description:\n"""${data.jobDescription}"""\n\nQuestions:\n${list}`,
      experimental_output: Output.object({
        schema: z.object({
          items: z.array(
            z.object({
              id: z.string(),
              tailored: z.string(),
            }),
          ),
        }),
      }),
    });

    return result.experimental_output.items;
  });
