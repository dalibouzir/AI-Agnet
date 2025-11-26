import path from 'path';

function normalizeString(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveChatTranscriptPath(): string {
  const customPath = normalizeString(process.env.CHAT_DATASET_PATH);
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }
  return path.join(process.cwd(), 'logs', 'chat-transcripts.jsonl');
}

