import { useMemo } from "react";

type AdvancedInsightsProps = {
  text: string;
};

type SentimentBreakdown = {
  label: string;
  value: number;
};

const sentimentPatterns = ["positive", "negative", "neutral"];

const normalizeLine = (line: string) => line.replace(/^[-•\d\)\.\s]+/, "").trim();

function extractSection(lines: string[], title: string): string[] {
  const idx = lines.findIndex((line) => line.toLowerCase().startsWith(title.toLowerCase()));
  if (idx === -1) return [];
  const items: string[] = [];
  for (let i = idx + 1; i < lines.length; i += 1) {
    const candidate = lines[i];
    if (!candidate) break;
    const lower = candidate.toLowerCase();
    if (lower.startsWith("**") || sentimentPatterns.some((token) => lower.includes(token))) {
      break;
    }
    if (/^(\d+\)|[-•])/.test(candidate.trim())) {
      items.push(normalizeLine(candidate));
      continue;
    }
    if (items.length && candidate.trim()) {
      items[items.length - 1] = `${items[items.length - 1]} ${candidate.trim()}`;
      continue;
    }
    if (!candidate.trim()) break;
  }
  return items;
}

function parseSentiment(line: string): SentimentBreakdown[] {
  const result: SentimentBreakdown[] = [];
  const matches = line.match(/([A-Za-z]+)\s*(\d+(?:\.\d+)?)%/g);
  if (!matches) return result;
  matches.forEach((match) => {
    const pieces = match.match(/([A-Za-z]+)\s*(\d+(?:\.\d+)?)%/);
    if (pieces) {
      result.push({ label: pieces[1], value: Number(pieces[2]) });
    }
  });
  return result;
}

export default function AdvancedInsights({ text }: AdvancedInsightsProps) {
  const insights = useMemo(() => {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return null;

    const sentimentLine = lines.find((line) => line.toLowerCase().includes("sentiment"));
    const sentiment = sentimentLine ? parseSentiment(sentimentLine) : [];

    const keyTakeaways = extractSection(lines, "key takeaways");
    const nextSteps = extractSection(lines, "next best actions");

    if (!sentiment.length && !keyTakeaways.length && !nextSteps.length) {
      return null;
    }

    return { sentiment, keyTakeaways, nextSteps };
  }, [text]);

  if (!insights) return null;

  const { sentiment, keyTakeaways, nextSteps } = insights;

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)]/50 p-5">
      {sentiment.length ? (
        <div>
          <h4 className="text-sm font-semibold text-[var(--text)]">Sentiment breakdown</h4>
          <div className="mt-3 space-y-2">
            {sentiment.map((item) => (
              <div key={item.label} className="text-xs text-muted">
                <div className="flex items-center justify-between">
                  <span className="uppercase tracking-[0.24em] text-[var(--text)]/80">{item.label}</span>
                  <span className="font-semibold text-[var(--text)]">{item.value.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-[var(--border)]/60">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]/80"
                    style={{ width: `${Math.max(4, Math.min(item.value, 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {keyTakeaways.length ? (
        <div>
          <h4 className="text-sm font-semibold text-[var(--text)]">Key takeaways</h4>
          <ul className="mt-2 space-y-2 text-sm text-[var(--text)]">
            {keyTakeaways.map((item, index) => (
              <li key={`${item}-${index}`} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/60 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {nextSteps.length ? (
        <div>
          <h4 className="text-sm font-semibold text-[var(--text)]">Action plan</h4>
          <ol className="mt-2 space-y-2 text-sm text-[var(--text)]">
            {nextSteps.map((item, index) => (
              <li key={`${item}-${index}`} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/40 px-3 py-2">
                <span className="mr-2 font-semibold text-[var(--accent)]">{index + 1}.</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
