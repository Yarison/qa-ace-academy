import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { generateObject, generateText, Output } from "ai";
import { z } from "zod";
import { createGeminiProvider } from "@/lib/ai-gateway.server";
import { checkAndConsumeAiUsage } from "@/lib/ai-usage.server";

// ---------- Resume analysis ----------

const ResumeInput = z
  .object({
    text: z.string().trim().min(50).max(20000).optional(),
    pdfBase64: z.string().max(6_000_000).optional(),
  })
  .refine((v) => v.text || v.pdfBase64, { message: "Provide text or PDF" });

export const ResumeSchema = z.object({
  yearsExperience: z.number().min(0).max(60),
  skills: z.array(z.string()).max(40),
  weakAreas: z.array(z.string()).max(20),
  summary: z.string().max(600),
});

export const analyzeResume = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data: unknown) => ResumeInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");

    const usage = await checkAndConsumeAiUsage(2);
    let resumeText = data.text ?? "";
    if (data.pdfBase64 && !resumeText) {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: "Extract ALL text content from this resume PDF, preserving section headings and dates. Return only the plain text — no commentary.",
                  },
                  { inlineData: { mimeType: "application/pdf", data: data.pdfBase64 } },
                ],
              },
            ],
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`PDF extraction failed (${res.status}): ${body.slice(0, 300)}`);
      }
      const json = await res.json();
      resumeText = json?.choices?.[0]?.message?.content ?? "";
      if (!resumeText || resumeText.length < 40) {
        throw new Error("Could not extract text from PDF. Try pasting text instead.");
      }
    }

    const gateway = createGeminiProvider(key);
    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
      system: `You are an experienced hiring manager analyzing a resume for any profession. Be specific and honest.
- yearsExperience: estimate years of professional experience (integer, best guess).
- skills: concrete skills present — technical, tools, soft skills, methodologies, languages. Max 20.
- weakAreas: gaps an interviewer would probe. Concrete phrases specific to this candidate's field. Max 8.
- summary: 2-3 sentence candidate summary.`,
      prompt: `Resume:\n"""${resumeText.slice(0, 16000)}"""`,
      experimental_output: Output.object({ schema: ResumeSchema }),
    });

    return { analysis: result.experimental_output, resumeText, usage };
  });

// ---------- JD analysis (universal, any profession) ----------

const GeneratedResumeExperienceSchema = z.object({
  company: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  dates: z.string().min(1).max(120),
  bullets: z.array(z.string()).max(8),
});

const GeneratedResumeEducationSchema = z.object({
  school: z.string().min(1).max(200),
  degree: z.string().min(1).max(200),
  dates: z.string().min(1).max(120),
});

export const GeneratedResumeSchema = z.object({
  summary: z.string().min(40).max(900),
  experience: z.array(GeneratedResumeExperienceSchema).max(12),
  skills: z.array(z.string()).max(40),
  education: z.array(GeneratedResumeEducationSchema).max(8),
});

export type GeneratedResume = z.infer<typeof GeneratedResumeSchema>;

const JdInput = z.object({
  resumeAnalysis: ResumeSchema.nullable(),
  jobDescription: z.string().trim().min(30).max(10000),
});

const JdSchema = z.object({
  technicalSkills: z.array(z.string()).max(20),
  softSkills: z.array(z.string()).max(15),
  toolsAndTechnologies: z.array(z.string()).max(20),
  industryKnowledge: z.array(z.string()).max(15),
  certifications: z.array(z.string()).max(10),
  keywordsAndCompetencies: z.array(z.string()).max(20),
  likelyQuestions: z.array(z.string()).max(15),
  matchScore: z.number().min(0).max(100).nullable(),
  summary: z.string().max(600),
});

export const analyzeJd = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data: unknown) => JdInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const usage = await checkAndConsumeAiUsage(2);
    const gateway = createGeminiProvider(key);

    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
      system: `You are an expert interview coach analyzing a job description for ANY profession (engineering, marketing, finance, healthcare, design, sales, operations, etc.). Extract structured requirements.

Return:
- technicalSkills: hard/technical skills the JD names or implies (empty [] if not applicable).
- softSkills: interpersonal, leadership, communication competencies.
- toolsAndTechnologies: named software, platforms, systems, or equipment.
- industryKnowledge: domain knowledge / regulations / market context.
- certifications: named certifications, licenses, credentials, or methodologies (e.g. PMP, CFA, Six Sigma, Scrum, HIPAA).
- keywordsAndCompetencies: important phrases and competencies the employer emphasizes.
- likelyQuestions: 8-12 interview questions tailored to THIS role, referencing the JD's language. One sentence each. Mix behavioral + role-specific.
- matchScore: 0-100 fit against the candidate — return null if no resumeAnalysis provided.
- summary: 2-3 sentences describing the role and what the interview will emphasize.

Every list must be JD-specific — do not return generic filler.`,
      prompt: `Candidate analysis (may be null):\n${JSON.stringify(data.resumeAnalysis)}\n\nJob description:\n"""${data.jobDescription}"""`,
      experimental_output: Output.object({ schema: JdSchema }),
    });

    return { ...result.experimental_output, usage };
  });

const GenerateResumeInput = z.object({
  jobDescription: z.string().trim().min(30).max(10000),
  resumeText: z.string().trim().max(20000).default(""),
  resumeAnalysis: ResumeSchema.nullable().optional(),
});

export const generateResume = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data: unknown) => GenerateResumeInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const usage = await checkAndConsumeAiUsage(5);
    const gateway = createGeminiProvider(key);
    const modelName = "gemini-3.1-flash-lite";

    try {
      const result = await generateObject({
        model: gateway(modelName),
        schema: GeneratedResumeSchema,
        system: `You are a resume writer. Produce a tailored resume based only on facts present in the candidate's resume and resume analysis.

Hard rules:
- Ground every fact only in the supplied resume and analysis. Never invent companies, titles, dates, certifications, metrics, or skills that are not supported by the input.
- Tailor the resume to the job description using terms that genuinely match the candidate's background.
- Keep the structure ATS-friendly and standard: summary, experience, skills, education.
- Experience entries must include company, title, dates, and clear bullets.
- Keep the tone factual and direct. Avoid generic AI phrasing such as "results-driven", "leveraged", "spearheaded", "dynamic", "synergy", "successfully", or any repetitive sentence rhythm.
- No tables or columns; this is structured JSON.
- Include only facts that are supported by the resume input.
- If a section is not supported, leave it empty rather than inventing content.`,
        prompt: `Job description:\n"""${data.jobDescription}"""\n\nResume text:\n"""${data.resumeText.slice(0, 18000)}"""\n\nResume analysis:\n${JSON.stringify(data.resumeAnalysis ?? null)}`,
      });

      return { ...result.object, usage };
    } catch (error) {
      console.error("[generateResume] AI failed", {
        model: modelName,
        error: error instanceof Error ? { name: error.name, message: error.message, cause: (error as Error & { cause?: unknown }).cause } : String(error),
      });
      throw error;
    }
  });

// ---------- AI-generated study plan ----------

const PlanDaySchema = z.object({
  date: z.string(),
  focusArea: z.string().max(80),
  topics: z.array(z.string()).max(8),
  activities: z.array(z.string()).max(6),
  estimatedHours: z.number().min(0).max(12),
  questions: z.array(z.string()).max(6).optional(),
  blockType: z.enum(["study", "job_search", "skill_practice"]).optional(),
});

const PlanInput = z.object({
  jobDescription: z.string().min(10).max(10000),
  jdAnalysis: JdSchema.nullable(),
  resumeAnalysis: ResumeSchema.nullable(),
  experienceLevel: z.enum(["beginner", "intermediate", "experienced"]),
  interviewType: z
    .enum(["general", "behavioral", "technical", "case", "panel", "take-home"])
    .optional(),
  hoursPerDay: z.number().min(1).max(12),
  days: z.number().int().min(1).max(60),
  startDate: z.string(), // ISO
});

const PlanSchema = z.object({
  plan: z.array(PlanDaySchema).max(60),
});

export const generatePlan = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data: unknown) => PlanInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const usage = await checkAndConsumeAiUsage(5);
    const gateway = createGeminiProvider(key);

    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
      system: `You are an interview preparation coach. Build a day-by-day preparation schedule for ANY profession based on the job description, the candidate's background, and their time budget.

Rules:
- Return exactly ${data.days} entries in "plan", one per day, starting on ${data.startDate}. Increment date by one day each entry (YYYY-MM-DD).
- Each day's estimatedHours must be <= ${data.hoursPerDay} (respect the candidate's time budget).
- Adapt to interviewType="${data.interviewType ?? "general"}". Example: behavioral -> stories/leadership; technical -> hard-skill drills; case -> frameworks/quantitative structuring; panel -> cross-functional communication.
- Tailor the plan to the candidate's experienceLevel="${data.experienceLevel}": beginners spend more time on foundations, experienced candidates focus on advanced/behavioral/company-specific prep.
- Prioritize gaps: missing skills from the resume vs JD, weak areas, and topics the employer emphasizes.
- focusArea should be a short category (e.g. "Technical foundations", "Tools mastery", "Behavioral stories", "Industry knowledge", "Mock interview", "Rest & review").
- blockType is required on every day and must match the day's actual work. Use exactly one of these:
  - "study": learning/interview content, passive review, reading, notes, research, and general prep; this is the baseline/default behavior.
  - "job_search": actively searching and applying for roles; review new postings, assess fit, tailor resumes, revise cover letters, and submit applications.
  - "skill_practice": hands-on skill work such as mock problems, practice questions, portfolio work, coding drills, roleplay, writing exercises, or scenario practice; distinct from "study" because it is active and applied.
- Across the full plan, allocate roughly 20% of days to "job_search" and 20% to "skill_practice", with the rest as "study", unless interviewType or the time budget makes that impractical. If days <= 3, skip "job_search" entirely and focus the plan on interview readiness rather than forcing the ratio. Do not over-optimize the ratio on short plans.
- For "job_search" days, activities must be concrete and action-oriented, not generic "look for jobs". Good examples: "Review 5 new matches for [role type]", "Tailor resume for your top pick", "Submit 2-3 applications", "Follow up on 2 recruiter contacts", "Evaluate 3 new postings against your target criteria".
- topics: 2-5 specific topics from the JD/resume analysis.
- activities: 2-5 concrete actions. For study days, use learning/review tasks. For skill_practice days, use active exercises. For job_search days, include concrete application-search tasks.
- If days >= 3, dedicate the second-to-last day to a full mock interview.
- The last day is always light: rest, review notes, prepare questions for the interviewer.
- Front-load high-priority gaps; back-load review and behavioral prep.
- If days <= 2, do NOT create a full curriculum. Build a triage plan: only highest-value activities with immediate interview impact, concrete rehearsal, and targeted likely questions from this JD.
- questions: 3-5 realistic interview questions the candidate should be able to answer at the end of that day. Match the day's focusArea and topics. Behavioral days -> behavioral questions; technical/tools days -> technical/scenario questions. Be specific to THIS role. Skip questions on pure "Rest & review" days.
- Be specific to THIS role — no generic filler.`,
      prompt: `startDate: ${data.startDate}
days: ${data.days}
hoursPerDay: ${data.hoursPerDay}
experienceLevel: ${data.experienceLevel}
interviewType: ${data.interviewType ?? "general"}

Job description:
"""${data.jobDescription.slice(0, 6000)}"""

JD analysis:
${JSON.stringify(data.jdAnalysis)}

Resume analysis (may be null):
${JSON.stringify(data.resumeAnalysis)}`,
      experimental_output: Output.object({ schema: PlanSchema }),
    });

    return { plan: result.experimental_output.plan, usage };
  });

// ---------- Answer evaluation ----------

const EvalInput = z.object({
  question: z.string().min(1).max(2000),
  answer: z.string().min(1).max(8000),
  focusArea: z.string().max(120).optional(),
  jobDescription: z.string().max(10000).optional(),
  jdAnalysis: JdSchema.nullable().optional(),
  resumeAnalysis: ResumeSchema.nullable().optional(),
});

const EvalSchema = z.object({
  score: z.number().min(0).max(10),
  feedback: z.string().max(1200),
  weakAreas: z.array(z.string()).max(6),
  followUpQuestions: z.array(z.string()).max(4),
  exampleAnswer: z.string().max(300).nullable(),
});

export const evaluateAnswer = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data: unknown) => EvalInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const usage = await checkAndConsumeAiUsage(1);
    const gateway = createGeminiProvider(key);

    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
      system: `You are a rigorous but supportive interview coach. Evaluate the candidate's answer to a real interview question. Be honest, concrete, and specific to the role.

Return:
- score: 0-10 (0-3 poor/off-topic, 4-6 partial, 7-8 solid, 9-10 excellent + role-tailored).
- feedback: 2-4 sentences. Call out what was strong, what was missing, and one concrete way to improve.
- weakAreas: 1-4 short phrases naming underlying gaps (e.g. "STAR structure", "quantifying impact", "SQL window functions"). These will be used to personalize the next study plan.
- followUpQuestions: 1-3 sharper interview-style follow-ups a real interviewer would ask next, based on gaps or claims made in the answer.
- exampleAnswer: a concise example answer (max 300 characters) demonstrating a strong response to the question, role-specific.`,
      prompt: `Focus area: ${data.focusArea ?? "n/a"}

Job description:
"""${(data.jobDescription ?? "").slice(0, 4000)}"""

JD analysis:
${JSON.stringify(data.jdAnalysis ?? null)}

Candidate background:
${JSON.stringify(data.resumeAnalysis ?? null)}

Interview question:
${data.question}

Candidate answer:
"""${data.answer}"""`,
      experimental_output: Output.object({ schema: EvalSchema }),
    });

    return { ...result.experimental_output, usage };
  });

// ---------- Plan refinement based on answer performance ----------

const RefineInput = z.object({
  jobDescription: z.string().min(10).max(10000),
  jdAnalysis: JdSchema.nullable(),
  resumeAnalysis: ResumeSchema.nullable(),
  experienceLevel: z.enum(["beginner", "intermediate", "experienced"]),
  interviewType: z
    .enum(["general", "behavioral", "technical", "case", "panel", "take-home"])
    .optional(),
  hoursPerDay: z.number().min(1).max(12),
  startDate: z.string(),
  remainingDays: z.number().int().min(1).max(60),
  currentPlan: z.array(PlanDaySchema).max(60),
  answerHistory: z
    .array(
      z.object({
        question: z.string(),
        score: z.number(),
        weakAreas: z.array(z.string()),
        focusArea: z.string().optional(),
      }),
    )
    .max(200),
});

export const refinePlan = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data: unknown) => RefineInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const usage = await checkAndConsumeAiUsage(5);
    const gateway = createGeminiProvider(key);

    const aggregatedWeakAreas = Array.from(
      new Set(data.answerHistory.flatMap((a) => a.weakAreas)),
    ).slice(0, 30);
    const avgScore = data.answerHistory.length
      ? (data.answerHistory.reduce((s, a) => s + a.score, 0) / data.answerHistory.length).toFixed(1)
      : "n/a";

    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
      system: `You are an interview coach revising a candidate's remaining study plan based on how they actually performed on practice questions.

Rules:
- Return exactly ${data.remainingDays} entries in "plan", one per day, starting on ${data.startDate} (YYYY-MM-DD, incrementing daily).
- Each estimatedHours <= ${data.hoursPerDay}.
- Adapt to interviewType="${data.interviewType ?? "general"}" and prioritize what that interview format rewards.
- Aggressively prioritize the aggregated weakAreas below — the weaker the past answers, the more days you spend re-drilling those gaps with fresh angles and harder follow-ups.
- Keep topics/activities specific to THIS role. Include a mock interview day near the end if remainingDays >= 3, and a light review on the final day.
- If remainingDays <= 2, build a triage plan with only the highest-leverage activities and role-specific likely questions; avoid broad coverage.
- questions: 3-5 targeted interview questions per day that directly probe the identified weak areas (or the day's focus).
- Do NOT repeat identical questions the candidate already answered.`,
      prompt: `startDate: ${data.startDate}
remainingDays: ${data.remainingDays}
hoursPerDay: ${data.hoursPerDay}
experienceLevel: ${data.experienceLevel}
interviewType: ${data.interviewType ?? "general"}
avgScore: ${avgScore}

Aggregated weak areas from past answers (prioritize these):
${aggregatedWeakAreas.join(", ") || "(none yet)"}

Recent answered questions (avoid duplicating):
${data.answerHistory
  .slice(-20)
  .map((a) => `- [${a.score}/10] ${a.question}`)
  .join("\n")}

Job description:
"""${data.jobDescription.slice(0, 5000)}"""

JD analysis:
${JSON.stringify(data.jdAnalysis)}

Resume analysis:
${JSON.stringify(data.resumeAnalysis)}`,
      experimental_output: Output.object({ schema: PlanSchema }),
    });

    return { plan: result.experimental_output.plan, usage };
  });

// ---------- Interview cheatsheet ----------

const CheatsheetInput = z.object({
  resumeText: z.string().max(20000).optional(),
  resumeAnalysis: ResumeSchema.nullable().optional(),
  jobDescription: z.string().min(10).max(10000),
  jdAnalysis: JdSchema.nullable().optional(),
  plan: z.array(PlanDaySchema).max(60),
  answers: z
    .record(
      z.string(),
      z.array(
        z.object({
          question: z.string(),
          answer: z.string(),
          score: z.number(),
          feedback: z.string(),
          weakAreas: z.array(z.string()),
          followUpQuestions: z.array(z.string()),
          exampleAnswer: z.string().nullable().optional(),
          answeredAt: z.string(),
        }),
      ),
    )
    .optional(),
  targetRole: z.string().max(200).optional(),
});

const CheatsheetAnswerItemSchema = z.object({
  question: z.string().max(320),
  label: z.enum(["Your Answer", "Improve This", "Suggested Answer"]),
  score: z.number().min(0).max(10).nullable(),
  talkingPoints: z.array(z.string()).min(2).max(5),
  note: z.string().max(240).nullable().optional(),
});

const CheatsheetStorySchema = z.object({
  title: z.string().max(160),
  points: z.array(z.string()).min(2).max(4),
});

const CheatsheetTopicSchema = z.object({
  topic: z.string().max(140),
  reason: z.string().max(220),
});

const CheatsheetSchema = z.object({
  mostLikelyQuestions: z.array(z.string().max(320)).min(5).max(12),
  bestAnswers: z.array(CheatsheetAnswerItemSchema).min(5).max(12),
  keyStories: z.array(CheatsheetStorySchema).max(6),
  topicsToReview: z.array(CheatsheetTopicSchema).max(8),
  questionsToAsk: z.array(z.string().max(220)).min(4).max(10),
});

export type InterviewCheatsheet = z.infer<typeof CheatsheetSchema>;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): Set<string> {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "into",
    "your",
    "have",
    "about",
    "what",
    "when",
    "where",
    "would",
    "could",
    "should",
    "did",
    "are",
    "how",
    "you",
    "why",
    "tell",
    "describe",
    "through",
    "explain",
  ]);
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((t) => t.length > 2 && !stop.has(t)),
  );
}

function overlapScore(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

type FlatAnswer = {
  question: string;
  answer: string;
  score: number;
  feedback: string;
  weakAreas: string[];
  followUpQuestions: string[];
  exampleAnswer?: string | null;
  answeredAt: string;
  date: string;
};

function findBestAnswerMatch(question: string, answers: FlatAnswer[]): FlatAnswer | null {
  const qNorm = normalizeText(question);
  let best: FlatAnswer | null = null;
  let bestScore = 0;

  for (const answer of answers) {
    const aQuestionNorm = normalizeText(answer.question);
    const base = overlapScore(qNorm, aQuestionNorm);
    const directBoost =
      qNorm.includes(aQuestionNorm) || aQuestionNorm.includes(qNorm)
        ? 0.35
        : 0;
    const scoreBoost = answer.score >= 6 ? 0.08 : 0;
    const total = base + directBoost + scoreBoost;
    if (total > bestScore) {
      bestScore = total;
      best = answer;
    }
  }

  return bestScore >= 0.22 ? best : null;
}

export const generateInterviewCheatsheet = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data: unknown) => CheatsheetInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const usage = await checkAndConsumeAiUsage(4);
    const gateway = createGeminiProvider(key);

    const planQuestions = data.plan.flatMap((d) => d.questions ?? []);
    const jdLikelyQuestions = data.jdAnalysis?.likelyQuestions ?? [];

    const likelyQuestions = Array.from(
      new Set([...jdLikelyQuestions, ...planQuestions].map((q) => q.trim()).filter(Boolean)),
    ).slice(0, 12);

    if (likelyQuestions.length === 0) {
      throw new Error("No roadmap questions found yet. Generate a plan with practice questions first.");
    }

    const flatAnswers: FlatAnswer[] = Object.entries(data.answers ?? {}).flatMap(([date, entries]) =>
      entries.map((entry) => ({ ...entry, date })),
    );

    const matched = likelyQuestions.map((question) => {
      const best = findBestAnswerMatch(question, flatAnswers);
      if (!best) {
        return {
          question,
          label: "Suggested Answer" as const,
          score: null,
          answer: null,
          feedback: null,
          weakAreas: [] as string[],
        };
      }
      if (best.score >= 6) {
        return {
          question,
          label: "Your Answer" as const,
          score: best.score,
          answer: best.answer,
          feedback: best.feedback,
          weakAreas: best.weakAreas,
        };
      }
      return {
        question,
        label: "Improve This" as const,
        score: best.score,
        answer: best.answer,
        feedback: best.feedback,
        weakAreas: best.weakAreas,
      };
    });

    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
      system: `You are an interview coach preparing a final pre-interview cheatsheet.

Output requirements:
- Keep every item concise and practical for immediate use.
- Prefer short talking points, not long paragraphs.
- Never invent candidate experience that is not supported by resume/jd context.
- Respect each label exactly:
  - "Your Answer": Use the candidate's own answer as the primary source. Tighten phrasing only.
  - "Improve This": Base suggestions directly on the candidate's existing answer and weaknesses.
  - "Suggested Answer": Build an answer only from supported resume/JD context; if evidence is thin, be transparent.
- Most likely questions must align with role and roadmap.
- Questions to ask interviewer should be thoughtful and specific to the role/company context in the JD.
`,
      prompt: `Target role: ${data.targetRole ?? "Unknown role"}

Resume text (may be partial):
"""${(data.resumeText ?? "").slice(0, 8000)}"""

Resume analysis:
${JSON.stringify(data.resumeAnalysis ?? null)}

Job description:
"""${data.jobDescription.slice(0, 7000)}"""

JD analysis:
${JSON.stringify(data.jdAnalysis ?? null)}

Roadmap-derived likely interview questions:
${JSON.stringify(likelyQuestions)}

Question matching with answer priority labels:
${JSON.stringify(matched)}

Generate the full cheatsheet now.`,
      experimental_output: Output.object({ schema: CheatsheetSchema }),
    });

    return {
      cheatsheet: result.experimental_output,
      usage,
    };
  });

// ---------- Persistence (signed-in users only) ----------

const TaskAnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
  score: z.number(),
  feedback: z.string(),
  weakAreas: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  exampleAnswer: z.string().nullable().optional(),
  answeredAt: z.string(),
});

const PrepStateSchema = z
  .object({
    resumeText: z.string(),
    resumeAnalysis: z.union([ResumeSchema, z.null()]),
    generatedResume: z.union([GeneratedResumeSchema, z.null()]).optional(),
    jobDescription: z.string(),
    jdAnalysis: z.union([JdSchema, z.null()]),
    interviewDate: z.union([z.string(), z.null()]).optional(),
    plan: z.array(PlanDaySchema),
    completed: z.array(z.string()),
    answers: z.record(z.string(), z.array(TaskAnswerSchema)).optional(),
  })
  .passthrough();

const SavePrepInput = PrepStateSchema.extend({
  roadmapId: z.string().min(1).max(120).optional(),
  roadmapName: z.string().min(1).max(120).optional(),
  roadmapColor: z.string().min(1).max(40).optional(),
});

export const savePrep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SavePrepInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roadmapId = data.roadmapId ?? "roadmap-1";
    const interviewDate = data.interviewDate ?? ((data as { preferences?: { interviewDate?: string | null } }).preferences?.interviewDate ?? null);
    const prepSessions = supabase.from("prep_sessions") as any;
    const { error } = await prepSessions.upsert(
      {
        user_id: userId,
        roadmap_id: roadmapId,
        roadmap_name: data.roadmapName ?? null,
        roadmap_color: data.roadmapColor ?? null,
        resume_text: data.resumeText,
        resume_analysis: data.resumeAnalysis,
        generated_resume: data.generatedResume ?? null,
        job_description: data.jobDescription,
        jd_analysis: data.jdAnalysis,
        interview_date: interviewDate,
        plan: data.plan,
        completed: data.completed,
        answers: data.answers ?? {},
      },
      { onConflict: "user_id,roadmap_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const LoadPrepInput = z
  .object({
    roadmapId: z.string().min(1).max(120).optional(),
  })
  .optional();

export const loadPrep = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LoadPrepInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roadmapId = data?.roadmapId ?? "roadmap-1";
    const prepSessions = supabase.from("prep_sessions") as any;
    const { data: row, error } = await prepSessions
      .select(
        "resume_text, resume_analysis, generated_resume, job_description, jd_analysis, interview_date, plan, completed, answers",
      )
      .eq("user_id", userId)
      .eq("roadmap_id", roadmapId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      resumeText: row.resume_text ?? "",
      resumeAnalysis: (row.resume_analysis as z.infer<typeof ResumeSchema> | null) ?? null,
      generatedResume: (row.generated_resume as z.infer<typeof GeneratedResumeSchema> | null) ?? null,
      jobDescription: row.job_description ?? "",
      jdAnalysis: (row.jd_analysis as z.infer<typeof JdSchema> | null) ?? null,
      interviewDate: row.interview_date ?? null,
      plan: (row.plan as z.infer<typeof PlanDaySchema>[] | null) ?? [],
      completed: (row.completed as string[] | null) ?? [],
      answers:
        ((row as { answers?: unknown }).answers as Record<
          string,
          z.infer<typeof TaskAnswerSchema>[]
        > | null) ?? {},
    };
  });
