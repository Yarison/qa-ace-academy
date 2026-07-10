import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ArrowRight, ArrowLeft, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { analyzeJd, savePrep, loadPrep } from "@/lib/prep.functions";
import { loadPrepLocal, savePrepLocal, EMPTY_PREP, type PrepState } from "@/lib/prep-storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/prep/jd")({
  head: () => ({
    meta: [
      { title: "Step 2 — Job description — qa.repl" },
      { name: "description", content: "Compare your resume to the target role and surface missing skills, likely questions, and topics to review." },
    ],
  }),
  component: JdStep,
});

function JdStep() {
  const navigate = useNavigate();
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [jd, setJd] = useState("");
  const [running, setRunning] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const local = loadPrepLocal();
    setState(local);
    setJd(local.jobDescription ?? "");
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSignedIn(true);
        try {
          const remote = await loadPrep();
          if (remote) {
            setState((s) => ({ ...s, ...remote }));
            setJd(remote.jobDescription ?? "");
          }
        } catch { /* ignore */ }
      }
    });
  }, []);

  async function persist(next: PrepState) {
    savePrepLocal(next);
    if (signedIn) {
      try { await savePrep({ data: next }); } catch { /* ignore */ }
    }
  }

  async function run() {
    if (!state.resumeAnalysis) {
      toast.error("Complete step 1 first (analyze your resume)");
      return;
    }
    if (jd.trim().length < 30) {
      toast.error("Paste the full job description");
      return;
    }
    setRunning(true);
    try {
      const analysis = await analyzeJd({
        data: {
          resumeAnalysis: state.resumeAnalysis,
          jobDescription: jd.trim(),
        },
      });
      const next: PrepState = { ...state, jobDescription: jd.trim(), jdAnalysis: analysis };
      setState(next);
      await persist(next);
      toast.success("Comparison ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  }

  const j = state.jdAnalysis;
  const canAnalyze = !!state.resumeAnalysis;

  return (
    <div>
      <header>
        <p className="eyebrow">Step 2</p>
        <h1 className="display-2 mt-2">Where are you interviewing?</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Paste the job description. We'll compare it to your resume and highlight the gap you need to close before the interview.
        </p>
      </header>

      {!canAnalyze && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber/40 bg-amber/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber shrink-0" />
          <div>
            You haven't analyzed a resume yet.
            <Link to="/prep/resume" className="ml-1 font-medium text-terminal hover:underline">Go back to step 1</Link>
            {" "}— or paste a JD anyway and we'll generate a generic study plan in step 3.
          </div>
        </div>
      )}

      <div className="surface mt-8 rounded-2xl border border-border p-6">
        <label className="block text-sm font-medium">Job description</label>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the full job description…"
          className="mt-2 min-h-[240px] w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
        />
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={run} disabled={running || !canAnalyze}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {j ? "Re-run comparison" : "Compare"}
          </Button>
          <Link to="/prep/resume" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> back
          </Link>
          <button
            onClick={() => {
              // Save JD text even without analysis so plan step can use it.
              const next: PrepState = { ...state, jobDescription: jd.trim() };
              setState(next);
              persist(next);
              navigate({ to: "/prep/plan" });
            }}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Skip to calendar <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {j && (
        <div className="surface mt-6 rounded-2xl border border-border p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Fit report</h2>
            <span className="font-mono text-sm">
              Match: <span className={j.matchScore >= 70 ? "text-terminal" : j.matchScore >= 40 ? "text-amber" : "text-destructive"}>{j.matchScore}%</span>
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{j.summary}</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="eyebrow">Missing skills</p>
              <ul className="mt-2 space-y-1 text-sm">
                {j.missingSkills.map((s) => <li key={s} className="flex gap-2"><span className="text-destructive">•</span> {s}</li>)}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Topics to review</p>
              <ul className="mt-2 space-y-1 text-sm">
                {j.topicsToReview.map((s) => <li key={s} className="flex gap-2"><span className="text-terminal">•</span> {s}</li>)}
              </ul>
            </div>
          </div>

          <div className="mt-6">
            <p className="eyebrow">Likely interview questions</p>
            <ol className="mt-2 space-y-2 text-sm">
              {j.likelyQuestions.map((q, i) => (
                <li key={i} className="flex gap-2"><span className="font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}.</span> {q}</li>
              ))}
            </ol>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={() => navigate({ to: "/prep/plan" })}>
              Next: build calendar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
