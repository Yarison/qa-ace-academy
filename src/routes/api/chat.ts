import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { Database } from "@/integrations/supabase/types";

const ALLOWED_TOPICS = [
  "General QA (API + SQL + Playwright)",
  "API testing",
  "SQL",
  "Playwright",
  "Manual testing & test strategy",
];

const SYSTEM = (topic: string, jobDescription?: string) => `You are an experienced QA hiring manager running a focused mock interview about "${topic}".
Rules:
- Ask ONE concise interview question at a time. Wait for the candidate's answer.
- After each candidate answer: give brief feedback (2-4 sentences), score that answer 1-10 in the format "Score: X/10", then ask the next question.
- Stay strictly on the topic. Mix easy → hard. Cover real-world testing scenarios.
- After 5 questions, write a final summary with overall score (out of 50), strengths, and 2 improvement areas. End with "INTERVIEW COMPLETE".
- Use markdown for code blocks when relevant.${
  jobDescription
    ? `\n- TAILOR every question to the job description below. Prioritize tools, domains, and responsibilities it mentions. Do not invent technologies that aren't in the JD.\n\nJob description:\n"""${jobDescription.slice(0, 6000)}"""`
    : ""
}
Start by greeting the candidate in one sentence${jobDescription ? " (acknowledge briefly that you'll tailor questions to their target role)" : ""} and asking question 1.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.replace("Bearer ", "");

        const supabase = createClient<Database>(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          }
        );

        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
        if (claimsError || !claimsData?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const body = (await request.json()) as { messages: UIMessage[]; topic?: string; jobDescription?: string };
        const topic = ALLOWED_TOPICS.includes(body.topic ?? "") ? body.topic! : ALLOWED_TOPICS[0];
        const jd = typeof body.jobDescription === "string" && body.jobDescription.trim().length >= 20
          ? body.jobDescription.trim()
          : undefined;

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM(topic, jd),
          messages: await convertToModelMessages(body.messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
