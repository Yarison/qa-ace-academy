import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Play, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { JobDescriptionPanel, loadJobDescription } from "@/components/JobDescription";
import { Button } from "@/components/ui/button";
import { VoiceInput } from "@/components/VoiceInput";
import { analyzeJd, evaluateAnswer } from "@/lib/prep.functions";

type MockQuestion = {
  question: string;
  timeLimitSeconds: number;
  kind: "behavioral" | "technical" | "mixed";
};

type MockResult = {
  question: string;
  answer: string;
  score: number;
  feedback: string;
  exampleAnswer: string | null;
  weakAreas: string[];
};

export const Route = createFileRoute("/mock")({
  head: () => ({
    meta: [
      { title: "Mock interview — qa.repl" },
      {
        name: "description",
        content:
          "Run a timed mock interview tailored to your saved job description and get a full report at the end.",
      },
    ],
  }),
  component: MockPage,
});

function MockPage() {
  const [jd, setJd] = useState("");
  const [totalMinutes, setTotalMinutes] = useState(20);
  const [sessionState, setSessionState] = useState<"setup" | "running" | "complete">("setup");
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [results, setResults] = useState<MockResult[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    setJd(loadJobDescription());
  }, []);

  const currentQuestion = questions[currentQuestionIndex] ?? null;

  const buildPlan = useCallback(
    (analysis: { likelyQuestions?: string[] } | null, totalMinutes: number) => {
      const rawQuestions = (analysis?.likelyQuestions ?? []).filter(Boolean).slice(0, 6);
      const fallback = [
        "Tell me about a time you had to resolve a difficult bug or issue under pressure.",
        "How would you approach testing a new API endpoint end to end?",
        "Describe how you would communicate a risk to a teammate or stakeholder.",
      ];
      const selected = rawQuestions.length ? rawQuestions : fallback;
      const count = Math.min(6, Math.max(4, Math.round(totalMinutes / 5)));
      const base = totalMinutes / count;

      return selected.slice(0, count).map((question) => {
        const kind: MockQuestion["kind"] =
          /time|situation|conflict|lead|team|stakeholder|customer/i.test(question)
            ? "behavioral"
            : /how would|design|debug|troubleshoot|explain|test|api|sql|playwright|query/i.test(
                  question,
                )
              ? "technical"
              : "mixed";
        const multiplier = kind === "behavioral" ? 1.35 : kind === "technical" ? 0.95 : 1.15;
        const minutes = Math.max(2, Math.round(base * multiplier));
        return {
          question,
          timeLimitSeconds: Math.min(600, minutes * 60),
          kind,
        };
      });
    },
    [],
  );

  const totalAllocatedSeconds = useMemo(
    () => questions.reduce((sum, q) => sum + q.timeLimitSeconds, 0),
    [questions],
  );

  const startSession = useCallback(async () => {
    if (!jd.trim()) {
      toast.error(
        "Save a job description in Prep first so the mock interview can be tailored to it.",
      );
      return;
    }

    const parsedMinutes = Number(totalMinutes);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes < 5 || parsedMinutes > 90) {
      toast.error("Choose a mock interview length between 5 and 90 minutes.");
      return;
    }

    setIsPreparing(true);
    try {
      const analysisData = await analyzeJd({
        data: {
          resumeAnalysis: null,
          jobDescription: jd.trim(),
        },
      });
      const { usage: _mockJdUsage, ...analysis } = analysisData;
      const plan = buildPlan(analysis, parsedMinutes);
      if (!plan.length) throw new Error("No questions were generated.");
      setQuestions(plan);
      setAnswers([]);
      setResults([]);
      setCurrentQuestionIndex(0);
      setAnswer("");
      setTimeLeft(plan[0].timeLimitSeconds);
      setSessionState("running");
      toast.success("Mock interview ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start the mock interview");
    } finally {
      setIsPreparing(false);
    }
  }, [jd, totalMinutes, buildPlan]);

  const finishSession = useCallback(
    async (allAnswers: string[]) => {
      setIsFinishing(true);
      try {
        const evaluations = await Promise.all(
          questions.map((q, index) =>
            evaluateAnswer({
              data: {
                question: q.question,
                answer: (allAnswers[index] ?? "").trim(),
                jobDescription: jd.trim(),
                jdAnalysis: null,
                resumeAnalysis: null,
              },
            }),
          ),
        );

        const report: MockResult[] = evaluations.map((result, index) => ({
          question: questions[index].question,
          answer: allAnswers[index] ?? "",
          score: result.score,
          feedback: result.feedback,
          exampleAnswer: result.exampleAnswer,
          weakAreas: result.weakAreas,
        }));

        setResults(report);
        setSessionState("complete");
        toast.success("Mock interview complete");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to grade the mock interview");
      } finally {
        setIsFinishing(false);
      }
    },
    [jd, questions],
  );

  const submitCurrentAnswer = useCallback(
    async (autoSubmitted = false) => {
      if (!currentQuestion) return;

      const trimmed = answer.trim();
      const nextAnswers = [...answers, trimmed];
      setAnswers(nextAnswers);

      if (currentQuestionIndex === questions.length - 1) {
        await finishSession(nextAnswers);
        return;
      }

      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setAnswer("");
      setTimeLeft(questions[nextIndex].timeLimitSeconds);

      if (!autoSubmitted) {
        toast.success("Answer recorded");
      }
    },
    [answer, answers, currentQuestion, currentQuestionIndex, finishSession, questions],
  );

  useEffect(() => {
    if (sessionState !== "running" || !currentQuestion || timeLeft === null) return;

    if (timeLeft <= 0) {
      setTimeLeft(0);
      void submitCurrentAnswer(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setTimeLeft((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [sessionState, currentQuestion, timeLeft, submitCurrentAnswer]);

  function resetSession() {
    setSessionState("setup");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setAnswer("");
    setAnswers([]);
    setResults([]);
    setTimeLeft(null);
  }

  return (
    <main className="page-shell px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="page-eyebrow">Full session</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Interview practice, timed.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            This uses the job description you already saved in Prep. Pick a total time, answer each
            question one at a time, and get a full report after the session.
          </p>
        </header>

        <div className="page-card p-6">
          {sessionState === "setup" ? (
            <div className="space-y-5">
              <div className="page-card-soft p-4 text-sm text-[var(--text-secondary)]">
                <p className="font-medium text-[var(--text-primary)]">
                  Using your saved Prep job description
                </p>
                <p className="mt-1">
                  {jd.trim()
                    ? "The interview questions will be tailored to the JD already saved for this app."
                    : "Save a job description in Prep first to tailor the questions."}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]">
                  Total time for the mock interview
                </label>
                <div className="mt-2 flex max-w-xs items-center gap-3">
                  <input
                    type="number"
                    min={5}
                    max={90}
                    value={totalMinutes}
                    onChange={(e) =>
                      setTotalMinutes(Math.max(5, Math.min(90, Number(e.target.value || 5))))
                    }
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                  <span className="text-sm text-[var(--text-secondary)]">minutes</span>
                </div>
              </div>

              <Button
                className="rounded-full"
                onClick={startSession}
                disabled={isPreparing || !jd.trim()}
              >
                {isPreparing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Start mock interview
              </Button>
            </div>
          ) : sessionState === "running" && currentQuestion ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="page-eyebrow">
                    question {currentQuestionIndex + 1}/{questions.length}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                    {currentQuestion.question}
                  </h2>
                </div>
                <div className="rounded-full border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-1 text-sm font-medium text-[var(--text-primary)]">
                  {String(Math.floor(timeLeft ?? 0 / 60)).padStart(2, "0")}:
                  {String((timeLeft ?? 0) % 60).padStart(2, "0")}
                </div>
              </div>

              <div className="page-card-soft p-4 text-sm text-[var(--text-secondary)]">
                <p className="font-medium text-[var(--text-primary)]">Time allocation</p>
                <p className="mt-1">
                  This question is allotted about{" "}
                  {Math.round((currentQuestion.timeLimitSeconds || 60) / 60)} minute
                  {Math.round((currentQuestion.timeLimitSeconds || 60) / 60) === 1 ? "" : "s"}.
                </p>
              </div>

              <VoiceInput
                value={answer}
                onChange={setAnswer}
                placeholder="Type your answer here…"
                className="min-h-[180px] text-sm"
                rows={8}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  className="rounded-full"
                  onClick={() => void submitCurrentAnswer(false)}
                  disabled={isFinishing}
                >
                  {isFinishing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Submit answer
                </Button>
                <Button
                  className="rounded-full"
                  variant="ghost"
                  onClick={() => setAnswer("")}
                  disabled={isFinishing || !answer.trim()}
                >
                  Clear
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="page-eyebrow">session complete</p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                    Your mock interview report
                  </h2>
                </div>
                <Button className="rounded-full" variant="outline" size="sm" onClick={resetSession}>
                  <RotateCcw className="mr-2 h-3.5 w-3.5" /> Start over
                </Button>
              </div>

              <div className="page-card-soft p-4 text-sm text-[var(--text-secondary)]">
                <p className="font-medium text-[var(--text-primary)]">Total planned time</p>
                <p className="mt-1">
                  {Math.round(totalAllocatedSeconds / 60)} minutes across {questions.length}{" "}
                  questions.
                </p>
              </div>

              <div className="space-y-4">
                {results.map((item, index) => (
                  <div key={`${item.question}-${index}`} className="page-card-soft p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-[var(--text-primary)]">
                        {index + 1}. {item.question}
                      </p>
                      <span className="rounded-full border border-[var(--card-border)] bg-[var(--bg-base)] px-2.5 py-1 text-sm font-semibold text-[var(--text-primary)]">
                        {item.score}/10
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                      <p className="font-medium text-[var(--text-primary)]">Your answer</p>
                      <p className="whitespace-pre-wrap">{item.answer || "No answer submitted."}</p>
                    </div>
                    <div className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] p-3 text-sm text-[var(--text-secondary)]">
                      <p className="font-medium text-[var(--text-primary)]">
                        How you should have answered
                      </p>
                      <p className="mt-1">{item.feedback}</p>
                    </div>
                    {item.exampleAnswer && (
                      <div className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] p-3 text-sm text-[var(--text-secondary)]">
                        <p className="font-medium text-[var(--text-primary)]">Example answer</p>
                        <p className="mt-1">{item.exampleAnswer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          <JobDescriptionPanel
            className="mt-6"
            onChange={(value) => {
              setJd(value);
              if (!value.trim()) {
                resetSession();
              }
            }}
          />
        </div>
      </div>
    </main>
  );
}
