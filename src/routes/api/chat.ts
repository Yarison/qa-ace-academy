import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM = (topic: string) => `You are an experienced QA hiring manager running a focused mock interview about "${topic}".
Rules:
- Ask ONE concise interview question at a time. Wait for the candidate's answer.
- After each candidate answer: give brief feedback (2-4 sentences), score that answer 1-10 in the format "Score: X/10", then ask the next question.
- Stay strictly on the topic. Mix easy → hard. Cover real-world testing scenarios.
- After 5 questions, write a final summary with overall score (out of 50), strengths, and 2 improvement areas. End with "INTERVIEW COMPLETE".
- Use markdown for code blocks when relevant.
Start by greeting the candidate in one sentence and asking question 1.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const body = (await request.json()) as { messages: UIMessage[]; topic?: string };
        const topic = body.topic || "general QA testing (API + SQL + Playwright)";

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM(topic),
          messages: await convertToModelMessages(body.messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
