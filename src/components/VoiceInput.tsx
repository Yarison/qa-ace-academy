import { useEffect, useId, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

type VoiceInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
  rows?: number;
  multiline?: boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
};

export function VoiceInput({
  value,
  onChange,
  placeholder,
  className = "",
  containerClassName = "",
  rows = 6,
  multiline = true,
  inputProps,
  textareaProps,
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputId = useId();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setIsSupported(false);
      setStatusMessage("Voice input isn't supported in this browser, please type your answer instead.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => Array.from(result).map((item) => item.transcript).join(" "))
        .join(" ")
        .trim();

      if (!transcript) return;
      const nextValue = value ? `${value} ${transcript}` : transcript;
      onChange(nextValue);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setStatusMessage(event.error === "not-allowed"
        ? "Microphone access was blocked. Please allow it and try again."
        : "Voice input failed. Please type your answer instead.");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [onChange, value]);

  function toggleListening() {
    if (!recognitionRef.current) {
      setIsSupported(false);
      setStatusMessage("Voice input isn't supported in this browser, please type your answer instead.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    setStatusMessage(null);
    setIsListening(true);
    recognitionRef.current.start();
  }

  const inputClassName = `w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus:border-terminal/60 ${className}`.trim();

  return (
    <div className={`flex flex-col gap-2 ${containerClassName}`.trim()}>
      <div className="flex items-start gap-2">
        {multiline ? (
          <Textarea
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className={inputClassName}
            {...textareaProps}
          />
        ) : (
          <input
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={inputClassName}
            {...inputProps}
          />
        )}
        <button
          type="button"
          onClick={toggleListening}
          disabled={!isSupported || isListening}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground transition hover:border-terminal/40 hover:text-terminal disabled:cursor-not-allowed disabled:opacity-60 ${isListening ? "border-terminal/40 text-terminal" : ""}`.trim()}
          aria-label={isListening ? "Stop voice input" : "Start voice input"}
          title={isListening ? "Stop voice input" : "Start voice input"}
        >
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      </div>
      {!isSupported && statusMessage && (
        <p className="text-[11px] text-muted-foreground">{statusMessage}</p>
      )}
      {isSupported && statusMessage && (
        <p className="text-[11px] text-muted-foreground">{statusMessage}</p>
      )}
    </div>
  );
}
