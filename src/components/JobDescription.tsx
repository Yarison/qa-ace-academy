import { useEffect, useState } from "react";
import { Briefcase, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const JD_STORAGE_KEY = "qa.repl.jd.v1";
const MAX_LEN = 8000;

export function loadJobDescription(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(JD_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function JobDescriptionPanel({
  onChange,
  className = "",
}: {
  onChange?: (jd: string) => void;
  className?: string;
}) {
  const [jd, setJd] = useState("");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = loadJobDescription();
    setJd(stored);
    setDraft(stored);
  }, []);

  function save() {
    const value = draft.slice(0, MAX_LEN).trim();
    try {
      if (value) localStorage.setItem(JD_STORAGE_KEY, value);
      else localStorage.removeItem(JD_STORAGE_KEY);
    } catch {}
    setJd(value);
    onChange?.(value);
    setOpen(false);
    toast.success(value ? "Job description saved" : "Job description cleared");
  }

  function clear() {
    setDraft("");
    try {
      localStorage.removeItem(JD_STORAGE_KEY);
    } catch {}
    setJd("");
    onChange?.("");
    toast.success("Job description cleared");
  }

  const hasJd = jd.length > 0;

  return (
    <div className={`surface rounded-xl border border-border p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Briefcase className="mt-0.5 h-4 w-4 text-terminal" />
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Tailor to a job description
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hasJd
                ? "Saved — questions and mock interviews will lean on this JD."
                : "Paste a JD and we'll focus questions on what matters for the role."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasJd && (
            <span className="inline-flex items-center gap-1 rounded-full bg-terminal/15 px-2 py-0.5 text-[10px] font-medium text-terminal">
              <Check className="h-3 w-3" /> active
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setOpen((s) => !s)}>
            {open ? "Close" : hasJd ? "Edit" : "Add JD"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste the job description here…"
            className="min-h-[160px] font-mono text-xs"
            maxLength={MAX_LEN}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{draft.length.toLocaleString()} / {MAX_LEN.toLocaleString()} chars</span>
            <div className="flex gap-2">
              {hasJd && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
              <Button size="sm" onClick={save}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
