"use client";
import dynamic from "next/dynamic";
import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import MarkdownContent from "@/components/MarkdownContent";
import AdvancedInsights from "@/components/AdvancedInsights";
import CitationCard from "@/components/CitationCard";
import ChartPreview from "@/components/ChartPreview";

const RiskVisuals = dynamic(() => import("@/components/RiskVisuals"), {
  ssr: false,
  loading: () => (
    <div className="mt-4 animate-pulse rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/40 p-5 text-xs text-muted">
      Preparing simulation visuals…
    </div>
  ),
});

type MessageRole = "user" | "assistant";
type MessageVariant = "tip" | "error" | "answer";

type Attachment = {
  id: string;
  name: string;
  url?: string;
  size?: string;
};

export type Citation = {
  docId: string;
  chunkId: string;
  text: string;
  score?: number;
  source?: string;
  metadata?: Record<string, unknown> | null;
};

export type CitationMeta = {
  id: string;
  file_name: string;
  path: string;
  score?: number;
};

export type QueryMeta = {
  route?: string;
  metrics?: {
    latency_ms?: number;
    tokens_in?: number;
    tokens_out?: number;
    cost_usd?: number;
    model?: string | null;
  };
  telemetry?: Record<string, unknown> & {
    planner_conf?: number | null;
    rag_conf?: number | null;
    helpUsed?: {
      rag?: boolean;
      risk?: boolean;
    } | null;
    disclosure?: string | null;
  };
  used?: Record<string, unknown> | null;
  citations?: Citation[];
  charts?: Array<{ type: string; title?: string; data: Record<string, unknown> }>;
  simulation?: unknown;
  sourcesUsed?: string[];
  raw?: unknown;
};

type Message = {
  id: string;
  role: MessageRole;
  content: string;
  variant?: MessageVariant;
  raw?: unknown;
  createdAt: number;
  metrics?: QueryMeta["metrics"];
  charts?: QueryMeta["charts"];
  simulation?: QueryMeta["simulation"];
  sourcesUsed?: string[];
  citations?: Citation[];
  meta?: {
    citations?: CitationMeta[];
  };
  attachments?: Attachment[];
  helpers?: {
    rag: boolean;
    risk: boolean;
  };
  disclosure?: string | null;
};

type ChatPaneProps = {
  onSourcesUpdate?: (sources: Citation[]) => void;
  onStatusChange?: (status: "idle" | "loading") => void;
  onMetaUpdate?: (meta: QueryMeta | null) => void;
  onPromptSent?: (prompt: string) => void;
};

const seededConversation: Message[] = [];

const examplePrompts = [
  "Where did gross margin land vs. budget?",
  "Run a Monte Carlo if ARR dips 10%.",
  "Summarize the latest uploaded deck for execs.",
  "What risks popped up in the last five chats?",
];

const rotatingPrompts = examplePrompts;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const stringifyRaw = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.error("Failed to stringify raw payload", error);
    return '"<unserializable payload>"';
  }
};

const createThreadId = () => `thread-${createId()}`;

const formatSeconds = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}s`;
};

const formatLatencyMs = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${(value / 1000).toFixed(2)}s`;
};

const formatTokens = (metrics?: QueryMeta["metrics"]) => {
  if (!metrics) return "—";
  const prompt = typeof metrics.tokens_in === "number" ? metrics.tokens_in : 0;
  const completion = typeof metrics.tokens_out === "number" ? metrics.tokens_out : 0;
  const total = prompt + completion;
  if (total <= 0) return "—";
  return `${total.toLocaleString()} tokens`;
};

const stripTrailingCitations = (value: string): string => {
  if (!value.trim()) return value;
  const lines = value.split("\n");
  let startIndex: number | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const normalized = lines[i].replace(/[*_`]/g, "").trim().toLowerCase();
    if (normalized.startsWith("citations")) {
      startIndex = i;
      break;
    }
  }
  if (startIndex === null) {
    return value.trimEnd();
  }
  return lines.slice(0, startIndex).join("\n").trimEnd();
};

const cleanAnswerText = (value: string): string => {
  if (!value.trim()) return value;
  const phrases = [
    "document search returned insufficient evidence",
    "the following summary relies on conversation context only",
  ];
  return value
    .split("\n")
    .filter((line) => {
      const normalized = line.toLowerCase();
      return !phrases.some((phrase) => normalized.includes(phrase));
    })
    .join("\n");
};

const MessageAvatar = ({ role, variant }: { role: MessageRole; variant?: MessageVariant }) => {
  const isAssistant = role === "assistant";
  const isError = variant === "error";
  const baseClass = isAssistant
    ? "bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)]"
    : "bg-[color:var(--text-primary)]/10 text-[color:var(--text-primary)]";
  const errorClass = isAssistant && isError ? "bg-[color:var(--color-accent)]/20 text-[color:var(--color-accent)]" : "";
  return (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-full text-base ${errorClass || baseClass}`}
      aria-hidden
    >
      {isAssistant ? "🤖" : "👤"}
    </span>
  );
};

const deriveHelpers = (
  telemetry: QueryMeta["telemetry"],
  used: Record<string, unknown> | null | undefined,
): { rag: boolean; risk: boolean } => {
  const teleHelp = telemetry && typeof telemetry.helpUsed === "object" ? telemetry.helpUsed : null;
  if (teleHelp) {
    return { rag: Boolean(teleHelp.rag), risk: Boolean(teleHelp.risk) };
  }
  const ragUsed = Boolean(used && typeof used === "object" && "rag" in used);
  const riskUsed = Boolean(used && typeof used === "object" && "risk" in used);
  return { rag: ragUsed, risk: riskUsed };
};

const renderFormattedText = (value: string, variant: "assistant" | "user" = "assistant"): ReactNode => {
  if (!value.trim()) {
    return <p className="text-sm text-[color:var(--text-primary)]">No content returned.</p>;
  }
  return <MarkdownContent text={value} variant={variant} />;
};

export default function ChatPane({ onSourcesUpdate, onStatusChange, onMetaUpdate, onPromptSent }: ChatPaneProps) {
  const [messages, setMessages] = useState<Message[]>(seededConversation);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const threadIdRef = useRef<string>(createThreadId());
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const placeholderFadeTimeout = useRef<number | null>(null);
  const placeholderInterval = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const focusInput = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const resetContext = useCallback(() => {
    onSourcesUpdate?.([]);
    onMetaUpdate?.(null);
    setExpandedMessageId(null);
    setCopiedMessageId(null);
  }, [onMetaUpdate, onSourcesUpdate]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!textareaRef.current) return;
    const element = textareaRef.current;
    element.style.height = "auto";
    const maxHeight = 240;
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
  }, [input]);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  useEffect(() => {
    setHydrated(true);
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      if (placeholderFadeTimeout.current !== null) {
        window.clearTimeout(placeholderFadeTimeout.current);
      }
      if (placeholderInterval.current !== null) {
        window.clearInterval(placeholderInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (placeholderInterval.current !== null) {
      window.clearInterval(placeholderInterval.current);
    }
    placeholderInterval.current = window.setInterval(() => {
      setPlaceholderVisible(false);
      placeholderFadeTimeout.current = window.setTimeout(() => {
        setPlaceholderIndex((index) => (index + 1) % rotatingPrompts.length);
        setPlaceholderVisible(true);
      }, 400);
    }, 5200);
    return () => {
      if (placeholderInterval.current !== null) {
        window.clearInterval(placeholderInterval.current);
      }
      if (placeholderFadeTimeout.current !== null) {
        window.clearTimeout(placeholderFadeTimeout.current);
      }
    };
  }, []);

  const handleCopyMessage = useCallback(
    async (text: string, id: string) => {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        console.warn("Clipboard API not available in this environment.");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        setCopiedMessageId(id);
        if (copyTimeoutRef.current !== null) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopiedMessageId((current) => (current === id ? null : current));
          copyTimeoutRef.current = null;
        }, 2000);
      } catch (error) {
        console.error("Failed to copy message", error);
        setCopiedMessageId(null);
      }
    },
    [],
  );

  const handleExampleInsert = useCallback(
    (prompt: string) => {
      setInput((value) => {
        if (!value) return prompt;
        return `${value.trimEnd()}${value.endsWith("\n") ? "" : "\n"}${prompt}`;
      });
      window.requestAnimationFrame(() => focusInput());
    },
    [focusInput],
  );

  const sendPrompt = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;

      const userMessage: Message = {
        id: createId(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      appendMessage(userMessage);
      onPromptSent?.(trimmed);
      setIsSubmitting(true);
      setIsThinking(true);
      onStatusChange?.("loading");
      resetContext();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            thread_id: threadIdRef.current,
            meta: { client: "web-app" },
          }),
        });
        const data: unknown = await response.json();

        if (!response.ok) {
          const detail = isRecord(data) && typeof data.detail === "string" ? data.detail : "Unable to reach orchestrator";
          throw new Error(detail);
        }

        const payload = isRecord(data) ? data : {};
        const text = typeof payload.text === "string" && payload.text.trim() ? payload.text.trim() : "No answer returned.";
        const cleanedText = cleanAnswerText(stripTrailingCitations(text));

        const metrics = isRecord(payload.metrics)
          ? {
              latency_ms: typeof payload.metrics.latency_ms === "number" ? payload.metrics.latency_ms : undefined,
              tokens_in: typeof payload.metrics.tokens_in === "number" ? payload.metrics.tokens_in : undefined,
              tokens_out: typeof payload.metrics.tokens_out === "number" ? payload.metrics.tokens_out : undefined,
              cost_usd: typeof payload.metrics.cost_usd === "number" ? payload.metrics.cost_usd : undefined,
              model: typeof payload.metrics.model === "string" ? payload.metrics.model : undefined,
            }
          : undefined;

        const metaPayload = isRecord(payload.meta) ? payload.meta : undefined;
        const telemetry = isRecord(payload.telemetry) ? payload.telemetry : undefined;
        const used = isRecord(payload.used) ? payload.used : null;
        const helpers = deriveHelpers(telemetry, used);
        const disclosure = typeof telemetry?.disclosure === "string" ? telemetry.disclosure : "Answered by LLM (no external evidence used).";

        const citations: Citation[] = Array.isArray(payload.citations)
          ? payload.citations
              .filter(isRecord)
              .map((item) => ({
                docId: typeof item.doc_id === "string" ? item.doc_id : typeof item.docId === "string" ? item.docId : "",
                chunkId: typeof item.chunk_id === "string" ? item.chunk_id : typeof item.chunkId === "string" ? item.chunkId : "",
                text: typeof item.text === "string" ? item.text : "",
                score: typeof item.score === "number" ? item.score : undefined,
                source: typeof item.source === "string" ? item.source : undefined,
                metadata: isRecord(item.metadata) ? item.metadata : null,
              }))
              .filter((item) => item.docId && item.chunkId && item.text)
          : [];

        const citationMeta: CitationMeta[] = Array.isArray(metaPayload?.citations)
          ? metaPayload.citations
              .filter(isRecord)
              .map((item) => ({
                id: typeof item.id === "string" ? item.id : typeof item.doc_id === "string" ? item.doc_id : "",
                file_name:
                  typeof item.file_name === "string"
                    ? item.file_name
                    : typeof item.fileName === "string"
                      ? item.fileName
                      : "",
                path: typeof item.path === "string" ? item.path : "",
                score: typeof item.score === "number" ? item.score : undefined,
              }))
              .filter((item) => item.id && item.file_name && item.path)
          : [];

        const charts =
          Array.isArray(payload.charts)
            ? payload.charts
                .filter(isRecord)
                .map((chart) => ({
                  type: typeof chart.type === "string" ? chart.type : "unknown",
                  title: typeof chart.title === "string" ? chart.title : undefined,
                  data: isRecord(chart.data) ? chart.data : {},
                }))
            : [];
        const simulation = isRecord(payload.simulation) ? payload.simulation : undefined;
        const attachments: Attachment[] = Array.isArray(payload.attachments)
          ? payload.attachments
              .filter(isRecord)
              .map((item, index) => {
                const name =
                  typeof item.name === "string" && item.name.trim().length > 0
                    ? item.name.trim()
                    : `Attachment ${index + 1}`;
                return {
                  id: typeof item.id === "string" ? item.id : `attachment-${index}`,
                  name,
                  url: typeof item.url === "string" ? item.url : undefined,
                  size: typeof item.size === "string" ? item.size : undefined,
                };
              })
              .filter((item) => Boolean(item.name))
          : [];

        const sourcesUsed =
          Array.isArray(payload.sources_used)
            ? payload.sources_used
                .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
                .filter(Boolean)
            : undefined;

        onSourcesUpdate?.(citations);
        onMetaUpdate?.({
          route: typeof payload.route === "string" ? payload.route : undefined,
          metrics,
          telemetry,
          used,
          charts,
          simulation,
          citations,
          sourcesUsed,
          raw: payload,
        });

        const assistantMessage: Message = {
          id: createId(),
          role: "assistant",
          content: cleanedText,
          variant: "answer",
          raw: payload,
          createdAt: Date.now(),
          metrics,
          charts,
          simulation,
          sourcesUsed,
          citations,
          meta: citationMeta.length ? { citations: citationMeta } : undefined,
          attachments,
          helpers,
          disclosure,
        };
        appendMessage(assistantMessage);
        setExpandedMessageId(null);
        setAnimatingId(assistantMessage.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error while fetching answer.";
        const assistantMessage: Message = {
          id: createId(),
          role: "assistant",
          content: message,
          variant: "error",
          createdAt: Date.now(),
        };
        appendMessage(assistantMessage);
      } finally {
        setIsSubmitting(false);
        onStatusChange?.("idle");
        setIsThinking(false);
      }
    },
    [appendMessage, onMetaUpdate, onPromptSent, onSourcesUpdate, onStatusChange, resetContext],
  );

  const handleSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (isSubmitting) return;
      const value = input.trim();
      if (!value) return;
      setInput("");
      focusInput();
      void sendPrompt(value);
    },
    [focusInput, input, isSubmitting, sendPrompt],
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
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--color-primary)]/18 text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--color-primary)]">
            AI
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-muted">Business Copilot</p>
            <p className="text-base font-semibold text-[color:var(--text-primary)]">Secure Chat Workspace</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-glass)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.32em] text-muted transition-all duration-200 ease-out ${
            isSubmitting ? "border-[color:var(--color-primary)]/70 text-[color:var(--color-primary)]" : ""
          }`}
          aria-live="polite"
        >
          <span className="flex h-2.5 w-2.5 items-center justify-center" aria-hidden>
            <span
              className={`h-2 w-2 rounded-full ${
                isSubmitting ? "animate-ping bg-[color:var(--color-primary)]" : "bg-[color:var(--color-primary)]/40"
              }`}
            />
          </span>
          {isSubmitting ? "Synthesizing" : "Ready"}
        </span>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto bg-gradient-to-b from-[color:var(--surface-glass)]/60 via-[color:var(--surface-muted)]/45 to-[color:var(--surface-glass)]/80 px-6 py-7">
        {messages.map((msg) => {
          const isAssistant = msg.role === "assistant";
          const isExpanded = expandedMessageId === msg.id;
          const rawJson = msg.raw ? stringifyRaw(msg.raw) : null;
          const articleClass = isAssistant
            ? msg.variant === "error"
              ? "group relative w-full max-w-4xl rounded-3xl border border-[color:var(--color-accent)]/60 bg-[color:var(--color-accent)]/12 px-6 py-5 text-[color:var(--color-accent)] transition-colors duration-200 ease-out"
              : "group relative w-full max-w-4xl space-y-3 px-1 py-1 text-[color:var(--text-primary)]"
            : "group relative w-full max-w-4xl rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-6 py-5 text-[color:var(--text-primary)] transition-colors duration-200 ease-out";
          const textClass =
            isAssistant && msg.variant === "error"
              ? "text-sm leading-relaxed text-[color:var(--color-accent)]"
              : "text-sm leading-relaxed text-[color:var(--text-primary)]";
          const articleShadow = isAssistant
            ? msg.variant === "error"
              ? "var(--shadow-soft)"
              : undefined
            : msg.variant === "error"
              ? "var(--shadow-soft)"
              : "var(--shadow-soft), var(--shadow-glow)";
          const metaItems =
            isAssistant && msg.variant === "answer"
              ? [
                  { key: "latency", label: "Latency", value: formatLatencyMs(msg.metrics?.latency_ms) },
                  { key: "tokens", label: "Tokens", value: formatTokens(msg.metrics) },
                  msg.metrics?.model ? { key: "model", label: "Model", value: msg.metrics.model } : null,
                ].filter(
                  (item): item is { key: string; label: string; value: string } =>
                    Boolean(item && item.value && item.value !== "—"),
                )
              : [];
          const actorLabel = isAssistant ? "Agent" : "You";
          const timestampLabel = hydrated ? formatTimestamp(msg.createdAt) : "—";
          const headerTextClass =
            isAssistant && msg.variant === "error"
              ? "text-[color:var(--color-accent)]"
              : "text-muted";
          const headerElement = (
            <header className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageAvatar role={msg.role} variant={msg.variant} />
                <span className={`text-xs font-semibold uppercase tracking-[0.24em] ${headerTextClass}`}>
                  {actorLabel}
                </span>
              </div>
              <span className="text-xs text-muted">{timestampLabel}</span>
            </header>
          );
          const assistantCitations = isAssistant ? msg.meta?.citations : undefined;
          const citationCards: CitationMeta[] = Array.isArray(assistantCitations) ? assistantCitations : [];
          const showCitationCards = citationCards.length > 0;
          const showLegacySources =
            isAssistant && !showCitationCards && Array.isArray(msg.sourcesUsed) && msg.sourcesUsed.length > 0;

          const articleElement = (
            <article className={articleClass} style={articleShadow ? { boxShadow: articleShadow } : undefined}>
              {headerElement}
              <div className={`space-y-3 ${textClass}`}>
                {isAssistant && msg.variant === "answer" ? (
                  <>
                    <Typewriter
                      text={msg.content}
                      active={msg.id === animatingId}
                      onComplete={() => {
                        if (animatingId === msg.id) setAnimatingId(null);
                      }}
                    >
                      {(display) => renderFormattedText(display, "assistant")}
                    </Typewriter>
                    {msg.helpers?.risk ? (
                      <RiskVisuals charts={msg.charts} simulation={msg.simulation} text={msg.content} />
                    ) : null}
                    {Array.isArray(msg.charts) && msg.charts.length > 0 ? (
                      <ChartPreview charts={msg.charts} />
                    ) : null}
                    <AdvancedInsights text={msg.content} />
                  </>
                ) : (
                  renderFormattedText(msg.content, "user")
                )}
              </div>
              {metaItems.length ? (
                <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                  {metaItems.map((item) => (
                    <span
                      key={`${msg.id}-${item.key}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-muted"
                    >
                      <span className="uppercase tracking-[0.24em] text-muted">{item.label}</span>
                      <span className="text-[color:var(--text-primary)] tracking-normal">{item.value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {isAssistant && msg.disclosure ? (
                <p className="mt-3 text-[11px] text-muted">{msg.disclosure}</p>
              ) : null}
              {isAssistant && Array.isArray(msg.attachments) && msg.attachments.length ? (
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  {msg.attachments.map((attachment) => (
                    <a
                      key={`${msg.id}-${attachment.id}`}
                      href={attachment.url || "#"}
                      target={attachment.url ? "_blank" : undefined}
                      rel="noreferrer"
                      className="inline-flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2 text-[color:var(--text-primary)] transition hover:-translate-y-px hover:border-[color:var(--color-primary)]/60"
                    >
                      <span aria-hidden className="text-base">
                        📎
                      </span>
                      <div className="flex flex-col overflow-hidden text-left leading-tight">
                        <span className="truncate font-semibold">{attachment.name}</span>
                        {attachment.size ? <span className="text-[11px] text-muted">{attachment.size}</span> : null}
                      </div>
                    </a>
                  ))}
                </div>
              ) : null}
              {showLegacySources ? (
                <div className="mt-4 space-y-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-3 text-sm text-[color:var(--text-primary)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">🔍 Sources Used</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {msg.sourcesUsed!.map((source) => (
                      <li key={`${msg.id}-${source}`} className="break-words">
                        {source}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {isAssistant && rawJson ? (
                <div className="mt-4 space-y-2 border-t border-dashed border-[color:var(--border-subtle)]/70 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.content, msg.id)}
                        className="rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-muted transition-all duration-200 ease-out hover:-translate-y-px hover:border-[color:var(--color-primary)]/60 hover:text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)]"
                      >
                        {copiedMessageId === msg.id ? "Copied" : "Copy answer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedMessageId(isExpanded ? null : msg.id)}
                        className="rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-muted transition-all duration-200 ease-out hover:-translate-y-px hover:border-[color:var(--color-primary)]/60 hover:text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)]"
                      >
                        {isExpanded ? "Hide diagnostics" : "View diagnostics"}
                      </button>
                    </div>
                    {msg.metrics?.latency_ms ? (
                      <span className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2 py-0.5 text-[11px] uppercase tracking-[0.24em] text-muted">
                        {formatLatencyMs(msg.metrics.latency_ms)}
                      </span>
                    ) : null}
                  </div>
                  {isExpanded ? (
                    <pre className="max-h-60 overflow-y-auto rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] p-3 text-[11px] text-[color:var(--text-primary)]">
                      {rawJson}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </article>
          );

          const rendered = showCitationCards ? (
            <div className="w-full">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px] md:items-start">
                <div className="min-w-0">{articleElement}</div>
                <aside className="min-w-0">
                  <CitationCard citations={citationCards} />
                </aside>
              </div>
            </div>
          ) : (
            articleElement
          );

          return (
            <div key={msg.id} className={`flex w-full ${isAssistant ? "justify-start" : "justify-end"}`}>
              {rendered}
            </div>
          );
        })}
        {isThinking ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-2 text-xs text-muted shadow-surface">
              <span className="inline-flex h-2 w-2 animate-ping rounded-full bg-[color:var(--color-primary)]" aria-hidden />
              Thinking about it…
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className="border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)]/55 px-6 py-5 backdrop-blur"
      >
        <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-gradient-to-br from-[color:var(--surface-glass)]/90 via-[color:var(--surface-muted)]/82 to-[color:var(--surface-glass)]/90 shadow-[var(--shadow-elev)]">
          <div className="relative flex items-center">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              style={{ maxHeight: 240 }}
              className="w-full resize-none overflow-hidden rounded-2xl bg-transparent px-5 pr-16 py-4 text-sm text-[color:var(--text-primary)] focus-visible:[box-shadow:var(--focus-ring)] focus-visible:outline-none"
              disabled={isSubmitting}
            />
            {!input && (
              <div
                className={`pointer-events-none absolute left-5 right-16 top-1/2 -translate-y-1/2 text-sm text-muted transition-opacity duration-500 ${
                  placeholderVisible ? "opacity-60" : "opacity-0"
                }`}
              >
                {rotatingPrompts[placeholderIndex]}
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-transparent text-[color:var(--text-primary)] transition-all duration-200 ease-out hover:-translate-y-[55%] hover:border-[color:var(--color-primary)]/50 hover:text-[color:var(--color-primary)] focus-visible:[box-shadow:var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? (
                <span className="text-base" aria-label="Sending">
                  ▢
                </span>
              ) : (
                <span className="text-base" aria-label="Send">
                  ↑
                </span>
              )}
            </button>
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.28em] text-muted">
          ⌘Enter to send · Shift+Enter for newline
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
          <span className="uppercase tracking-[0.28em] text-[11px]">Try:</span>
          {examplePrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleExampleInsert(prompt)}
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-1 text-[11px] text-[color:var(--text-primary)] transition hover:-translate-y-px hover:border-[color:var(--color-primary)]/50 focus-visible:[box-shadow:var(--focus-ring)]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function Typewriter({
  text,
  active,
  onComplete,
  children,
}: {
  text: string;
  active: boolean;
  onComplete?: () => void;
  children?: (value: string) => ReactNode;
}) {
  const [display, setDisplay] = useState(active ? "" : text);
  const [finished, setFinished] = useState(!active);

  useEffect(() => {
    if (!active) {
      setDisplay(text);
      setFinished(true);
      return;
    }
    if (typeof window === "undefined") {
      setDisplay(text);
      setFinished(true);
      return;
    }
    setDisplay("");
    setFinished(false);
    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setDisplay(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(interval);
        setFinished(true);
      }
    }, 12);
    return () => window.clearInterval(interval);
  }, [active, text]);

  useEffect(() => {
    if (finished && onComplete) {
      onComplete();
    }
  }, [finished, onComplete]);

  if (children) {
    return <>{children(display)}</>;
  }
  return <span>{display}</span>;
}
