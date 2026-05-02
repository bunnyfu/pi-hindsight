import type { HindsightLikeClient, RetainJob } from "./types.js";

export function redactQueueError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const text = message
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED_API_KEY]")
    .replace(/\b(ghp_[A-Za-z0-9_]{12,})\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(
      /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*)[^\s\n"',}]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /\b((?:api[_-]?key|token|secret|password|authorization)\s*:\s*)["']?[^\s\n"',}]+["']?/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(["'](?:api[_-]?key|token|secret|password|authorization)["']\s*:\s*)["'][^"']+["']/gi,
      '$1"[REDACTED]"',
    )
    .replace(/\b((?:Cookie|Set-Cookie)\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/)([^\s/@]+):([^\s/@]+)@/gi, "$1[REDACTED]@");
  return text.replace(/https?:\/\/[^\s"'<>]+/gi, (url) =>
    url.replace(/([?&])([^=&#\s]+)=([^&#\s]+)/g, (match, separator, key) => {
      if (!/(?:token|key|secret|password|api[_-]?key|apikey)/i.test(String(key))) {
        return String(match);
      }
      return `${String(separator)}${String(key)}=[REDACTED]`;
    }),
  );
}

export function retainOptionsForJob(job: RetainJob) {
  return {
    context: job.item.context,
    ...(job.item.timestamp ? { timestamp: job.item.timestamp } : {}),
    ...(job.item.metadata ? { metadata: job.item.metadata } : {}),
    ...(job.item.async !== undefined ? { async: job.item.async } : {}),
    ...(job.item.entities?.length ? { entities: job.item.entities } : {}),
    ...(job.item.tags ? { tags: job.item.tags } : {}),
    ...(job.item.observationScopes ? { observationScopes: job.item.observationScopes } : {}),
    documentId: job.documentId,
    updateMode: job.updateMode,
  };
}

export async function deliverRetainJob(client: HindsightLikeClient, job: RetainJob): Promise<void> {
  await client.retain(job.bankId, job.item.content, retainOptionsForJob(job));
}
