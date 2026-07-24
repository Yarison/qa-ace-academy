import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { JobDescriptionPanel, loadJobDescription } from "@/components/JobDescription";
import { analyzeJd, evaluateAnswer } from "@/lib/prep.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { VoiceInput } from "@/components/VoiceInput";

export const Route = createFileRoute("/practice/")({
  head: () => ({
    meta: [
      { title: "Practice — qa.repl" },
      {
        name: "description",
        content:
          "Practice interview questions generated from your saved job description and get scored feedback.",
      },
    ],
  }),
  component: PracticeIndex,
});

type PracticeResult = {
  score: number;
  feedback: string;
  weakAreas: string[];
  followUpQuestions: string[];
  exampleAnswer: string | null;
};

type JdAnalysis = {
  likelyQuestions?: string[];
};

function PracticeIndex() {
  const [jd, setJd] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [analysis, setAnalysis] = useState<JdAnalysis | null>(null);
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  useEffect(() => {
    setJd(loadJobDescription());
  }, []);

  async function generateQuestions() {
    if (!jd.trim()) {
      toast.error("Add your job description first so questions can be tailored to the role.");
      return;
    }

    setIsGenerating(true);
    try {
      const data = await analyzeJd({
        data: {
          resumeAnalysis: null,
          jobDescription: jd.trim(),
        },
      });
      const { usage: _jdUsage, ...jdAnalysis } = data;
      const generated = (jdAnalysis?.likelyQuestions ?? []).filter(Boolean).slice(0, 6);
      if (!generated.length) {
        throw new Error("No practice questions were generated from this JD.");
      }

      setAnalysis(jdAnalysis as JdAnalysis);
      setQuestions(generated);
      setCurrentQuestionIndex(0);
      setAnswer("");
      setResult(null);
      toast.success("Practice questions generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate practice questions");
    } finally {
      setIsGenerating(false);
    }
  }

  async function submitAnswer() {
    if (!answer.trim()) {
      toast.error("Type an answer before submitting it.");
      return;
    }

    const question = questions[currentQuestionIndex];
    if (!question) return;

    setIsEvaluating(true);
    try {
      const evaluation = await evaluateAnswer({
        data: {
          question,
          answer: answer.trim(),
          jobDescription: jd.trim(),
          jdAnalysis: analysis ?? null,
          resumeAnalysis: null,
        },
      });
      const { usage: _evalUsage, ...evalResult } = evaluation;
      setResult(evalResult as PracticeResult);
      toast.success("Answer graded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to grade your answer");
    } finally {
      setIsEvaluating(false);
    }
  }

  function resetPractice() {
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setAnswer("");
    setAnalysis(null);
    setResult(null);
  }

  const currentQuestion = questions[currentQuestionIndex] ?? "";
  const isLastQuestion = currentQuestionIndex >= questions.length - 1;

  return (
    <main className="page-shell px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="page-eyebrow">Question drills.</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
              Practice interview questions.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Questions are generated from the job description you already saved in Prep. Answer
              each one, and we’ll score it on a 1–10 scale with concrete feedback.
            </p>
          </div>
          <Button
            className="rounded-full"
            variant="outline"
            size="sm"
            onClick={resetPractice}
            disabled={isGenerating || isEvaluating}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Start over
          </Button>
        </div>

        <JobDescriptionPanel
          className="mt-6"
          onChange={(value) => {
            setJd(value);
            if (!value.trim()) {
              resetPractice();
            }
          }}
        />

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            className="rounded-full"
            onClick={generateQuestions}
            disabled={isGenerating || isEvaluating || !jd.trim()}
          >
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {questions.length ? "Generate a new set" : "Generate practice questions"}
          </Button>
          {!jd.trim() && (
            <span className="text-sm text-muted-foreground">
              Save a job description above to generate tailored questions.
            </span>
          )}
        </div>

        {questions.length > 0 && (
          <div className="mt-8 space-y-6">
            <div className="page-card p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="page-eyebrow">
                    question {currentQuestionIndex + 1}/{questions.length}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                    {currentQuestion}
                  </h2>
                </div>
                <span className="rounded-full border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                  {result ? "graded" : "awaiting answer"}
                </span>
              </div>

              {!result ? (
                <div className="mt-6 space-y-3">
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
                      onClick={submitAnswer}
                      disabled={isEvaluating || !answer.trim()}
                    >
                      {isEvaluating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Submit answer
                    </Button>
                    <Button
                      className="rounded-full"
                      variant="ghost"
                      onClick={() => setAnswer("")}
                      disabled={isEvaluating || !answer.trim()}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-4 rounded-xl border border-[var(--card-border)] bg-[var(--bg-base)] p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-[var(--text-primary)] px-3 py-1 text-sm font-semibold text-background">
                      Score: {result.score}/10
                    </span>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {result.weakAreas.length > 0
                        ? `Focus areas: ${result.weakAreas.join(", ")}`
                        : "Strong answer structure"}
                    </span>
                  </div>
                  <p className="text-sm leading-7 text-[var(--text-primary)]">{result.feedback}</p>
                  {result.exampleAnswer && (
                    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] p-3">
                      <p className="page-eyebrow">example answer</p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {result.exampleAnswer}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!isLastQuestion ? (
                      <Button
                        className="rounded-full"
                        onClick={() => {
                          setCurrentQuestionIndex((i) => i + 1);
                          setAnswer("");
                          setResult(null);
                        }}
                      >
                        Next question
                      </Button>
                    ) : (
                      <Button
                        className="rounded-full"
                        onClick={generateQuestions}
                        disabled={isGenerating}
                      >
                        {isGenerating ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Generate another set
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
