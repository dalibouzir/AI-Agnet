export type DocumentMetadata = Record<string, unknown>;

const FILE_KEYS = ["title", "filename", "file_name", "original_basename"];
const PATH_KEYS = ["path", "raw_path", "object", "object_key"];

export function resolveMetadataTitle(metadata?: DocumentMetadata | null): string | null {
  if (!metadata) return null;
  for (const key of FILE_KEYS) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  const userMetadata = metadata.user_metadata;
  if (userMetadata && typeof userMetadata === "object") {
    const cast = userMetadata as DocumentMetadata;
    for (const key of FILE_KEYS) {
      const value = cast[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    const manifest = cast.manifest_name ?? cast.original_filename;
    if (typeof manifest === "string" && manifest.trim()) {
      return manifest.trim();
    }
  }
  return null;
}

export function resolveMetadataPath(metadata?: DocumentMetadata | null, fallback?: string | null): string | null {
  if (metadata) {
    for (const key of PATH_KEYS) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  if (fallback && fallback.trim()) {
    return fallback.trim();
  }
  return null;
}

export function cleanDisplayPath(path: string | null): string {
  if (!path) return "Direct upload";
  return path.replace(/^s3:\/\//i, "");
}

export function resolveObjectKey(record: { object_key?: string | null; metadata?: DocumentMetadata | null }): string | null {
  if (typeof record.object_key === "string" && record.object_key.trim()) {
    return record.object_key.trim();
  }
  if (record.metadata && typeof record.metadata === "object") {
    const meta = record.metadata as DocumentMetadata;
    const candidates = [meta.object, meta.raw_key, meta.object_key];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return null;
}
