"use client";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

type MessageRole = "user" | "assistant";
type MessageVariant = "tip" | "error" | "answer";

export type SourceInfo = { title: string; score: number; path: string; preview: string };

type Message = {
  id: string;
  role: MessageRole;
  content: string;
  variant?: MessageVariant;
};

type ChatPaneProps = {
  onSourcesUpdate?: (sources: SourceInfo[]) => void;
  onStatusChange?: (status: "idle" | "loading") => void;
};

const seededConversation: Message[] = [
  { id: "seed-user", role: "user", content: "How did revenue trend last quarter?" },
  {
    id: "seed-assistant",
    role: "assistant",
    variant: "tip",
    content:
      "Revenue grew 11% QoQ driven by enterprise. Top drivers: expanded usage at Northwind and reduced SMB churn. Want a scenario run?",
  },
];

const quickChips = [
  "Finance",
  "Ops",
  "GTM",
];

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function ChatPane({ onSourcesUpdate, onStatusChange }: ChatPaneProps) {
  const [messages, setMessages] = useState<Message[]>(seededConversation);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const resetSources = useCallback(() => {
    onSourcesUpdate?.([]);
  }, [onSourcesUpdate]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;

      const userMessage: Message = {
        id: createId(),
        role: "user",
        content: trimmed,
      };
      appendMessage(userMessage);
      setIsSubmitting(true);
      onStatusChange?.("loading");
      resetSources();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: trimmed }),
        });
        const data = await response.json();

        if (!response.ok) {
          const detail = typeof data?.detail === "string" ? data.detail : "Unable to reach orchestrator";
          throw new Error(detail);
        }

        const answer = typeof data?.answer === "string" && data.answer.trim() ? data.answer.trim() : "No answer returned.";
        const assistantMessage: Message = {
          id: createId(),
          role: "assistant",
          content: answer,
          variant: "answer",
        };
        appendMessage(assistantMessage);

        if (Array.isArray(data?.sources)) {
          const sources: SourceInfo[] = data.sources
            .filter(
              (item: unknown): item is SourceInfo =>
                typeof item === "object" &&
                item !== null &&
                typeof (item as SourceInfo).title === "string" &&
                typeof (item as SourceInfo).path === "string" &&
                typeof (item as SourceInfo).preview === "string" &&
                typeof (item as SourceInfo).score === "number",
            )
            .map((item) => ({
              title: item.title,
              score: item.score,
              path: item.path,
              preview: item.preview,
            }));
          onSourcesUpdate?.(sources);
        } else {
          resetSources();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error while fetching answer.";
        const assistantMessage: Message = {
          id: createId(),
          role: "assistant",
          content: message,
          variant: "error",
        };
        appendMessage(assistantMessage);
      } finally {
        setIsSubmitting(false);
        onStatusChange?.("idle");
      }
    },
    [appendMessage, onSourcesUpdate, onStatusChange, resetSources],
  );

  const handleSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (isSubmitting) return;
      const value = input.trim();
      if (!value) return;
      setInput("");
      void sendPrompt(value);
    },
    [input, isSubmitting, sendPrompt],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="flex h-[580px] flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto bg-[var(--panel-2)] px-6 py-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <span className={getBubbleClass(msg.role, msg.variant)}>{msg.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="space-y-3 border-t border-[var(--border)] bg-[var(--panel)] px-5 py-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>⌘K opens Ask with Context.</span>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-xs font-medium text-muted transition-all duration-fast ease-out hover:-translate-y-px hover:border-[var(--accent)] hover:text-[var(--text)] focus-visible:[box-shadow:var(--focus)]"
          >
            📎 Attach
          </button>
        </div>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask for insights, simulations, or playbooks…"
          rows={3}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3 text-sm text-[var(--text)] focus-visible:[box-shadow:var(--focus)] focus-visible:outline-none"
          disabled={isSubmitting}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {quickChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setInput((value) => `${value ? `${value} ` : ""}${chip}`);
                }}
                className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs font-medium text-muted transition-all duration-fast ease-out hover:-translate-y-px hover:border-[var(--accent)] hover:text-[var(--text)] focus-visible:[box-shadow:var(--focus)]"
              >
                {chip}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[#0A0E16] transition-all duration-fast ease-out hover:-translate-y-px hover:shadow-[0_0_20px_rgba(0,229,255,0.45)] focus-visible:[box-shadow:var(--focus)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Synthesizing…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function getBubbleClass(role: MessageRole, variant?: MessageVariant) {
  if (role === "user") {
    return "max-w-xl whitespace-pre-line rounded-xl bg-[var(--accent)]/20 px-4 py-3 text-sm text-[var(--accent)] shadow-surface backdrop-blur-0";
  }
  if (variant === "tip") {
    return "max-w-xl whitespace-pre-line rounded-xl border border-[var(--accent)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] shadow-surface";
  }
  if (variant === "error") {
    return "max-w-xl whitespace-pre-line rounded-xl border border-[var(--danger)] bg-[var(--panel-2)] px-4 py-3 text-sm text-[var(--danger)] shadow-surface";
  }
  return "max-w-xl whitespace-pre-line rounded-xl bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] shadow-surface";
}
