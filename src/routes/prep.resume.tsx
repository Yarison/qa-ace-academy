import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Upload, Loader2, ArrowRight, ArrowLeft, FileText, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { analyzeResume, savePrep, loadPrep } from "@/lib/prep.functions";
import type { AiUsageResult } from "@/lib/ai-usage.server";
import {
  getActiveRoadmapLocal,
  loadPrepLocal,
  savePrepLocal,
  EMPTY_PREP,
  type PrepRoadmap,
  type PrepState,
} from "@/lib/prep-storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/prep/resume")({
  head: () => ({
    meta: [
      { title: "Step 2 — Your resume — AI Interview Coach" },
      {
        name: "description",
        content:
          "Optionally upload or paste your resume for a personalized fit report and study plan.",
      },
    ],
  }),
  component: ResumeStep,
});

function ResumeStep() {
  const navigate = useNavigate();
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [activeRoadmap, setActiveRoadmap] = useState<PrepRoadmap | null>(null);
  const [usage, setUsage] = useState<AiUsageResult | null>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const active = getActiveRoadmapLocal();
    setActiveRoadmap(active);
    const local = active.state ?? loadPrepLocal();
    setState(local);
    setText(local.resumeText ?? "");
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSignedIn(true);
        try {
          const remote = await loadPrep({ data: { roadmapId: active.id } });
          if (remote) {
            const merged = { ...local, ...remote };
            setState(merged);
            setText(remote.resumeText ?? "");
            savePrepLocal(merged);
          }
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  async function persist(next: PrepState) {
    savePrepLocal(next);
    setActiveRoadmap((prev) => (prev ? { ...prev, state: next } : prev));
    if (signedIn) {
      try {
        await savePrep({
          data: {
            ...next,
            roadmapId: activeRoadmap?.id,
            roadmapName: activeRoadmap?.name,
            roadmapColor: activeRoadmap?.color,
          },
        });
      } catch {
        /* ignore */
      }
    }
  }

  async function onFile(f: File) {
    if (f.size > 4_500_000) {
      toast.error("File must be under 4.5 MB");
      return;
    }
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      const b64 = await fileToBase64(f);
      setPdfBase64(b64);
      setFileName(f.name);
      setText("");
      toast.success(`${f.name} attached. Click Analyze to extract & analyze.`);
    } else if (
      f.type.startsWith("text/") ||
      f.name.toLowerCase().endsWith(".txt") ||
      f.name.toLowerCase().endsWith(".md")
    ) {
      const t = await f.text();
      setText(t);
      setFileName(f.name);
      setPdfBase64(null);
    } else {
      toast.error("Unsupported file. Upload a PDF or paste text.");
    }
  }

  async function analyze() {
    if (!text.trim() && !pdfBase64) {
      toast.error("Upload a PDF or paste your resume");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await analyzeResume({
        data: text.trim() ? { text: text.trim() } : { pdfBase64: pdfBase64! },
      });
      setUsage(res.usage ?? null);
      const next: PrepState = {
        ...state,
        resumeText: res.resumeText,
        resumeAnalysis: res.analysis,
      };
      setState(next);
      setText(res.resumeText);
      await persist(next);
      toast.success("Resume analyzed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const a = state.resumeAnalysis;

  return (
    <div>
      <header>
        <p className="eyebrow">Step 2 · optional</p>
        <h1 className="display-2 mt-2">Tell us about you.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Optional but recommended. Upload a PDF or paste your resume to get a match score against
          the JD and a truly personalized plan focused on your gaps.
        </p>
      </header>

      <div className="surface mt-8 rounded-2xl border border-border p-6">
        <label className="block">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Resume</span>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-accent">
              <Upload className="h-3.5 w-3.5" />
              {fileName ? "Change file" : "Upload PDF or .txt"}
              <input
                type="file"
                accept=".pdf,application/pdf,text/plain,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
          </div>
          {fileName && pdfBase64 ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3 text-sm">
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-terminal" /> {fileName}
              </span>
              <button
                onClick={() => {
                  setPdfBase64(null);
                  setFileName(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileName(null);
              }}
              placeholder="Paste your resume text here…"
              className="min-h-[220px] w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
            />
          )}
        </label>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={analyze} disabled={analyzing}>
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {a ? "Re-analyze" : "Analyze resume"}
          </Button>
          {usage ? (
            <p className="text-sm text-muted-foreground">
              {usage.type === "signed-in"
                ? `${usage.remaining} points left today`
                : `${usage.remaining} free AI ${usage.remaining === 1 ? "try" : "tries"} left`}
            </p>
          ) : null}
          <Link
            to="/prep/jd"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> back to JD
          </Link>
          <button
            onClick={() => navigate({ to: "/prep/plan" })}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Skip to plan <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {a && (
        <div className="surface mt-6 rounded-2xl border border-border p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Your profile</h2>
            <span className="text-sm text-muted-foreground">
              ~{a.yearsExperience} years experience
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{a.summary}</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="eyebrow">Skills</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="eyebrow">Areas to strengthen</p>
              <ul className="mt-2 space-y-1 text-sm">
                {a.weakAreas.map((w) => (
                  <li key={w} className="flex gap-2">
                    <span className="text-destructive">•</span> {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={() => navigate({ to: "/prep/plan" })}>
              Next: build my plan <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
