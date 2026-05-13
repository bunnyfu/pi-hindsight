import { createHash } from "node:crypto";

import type { ResolvedConfig } from "../types.js";

export const STRICT_SUCCESSFUL_TOOL_RESULT_MAX_BYTES = 2 * 1024;

export type ImportNoiseDropReason =
  | "successful-tool-output"
  | "tool-filter-excluded"
  | "tool-result-empty"
  | "recalled-memory"
  | "empty-projection"
  | "ui-noise"
  | "process-noise"
  | "oversized-output"
  | "repeated-output";

export interface ImportToolNoisePolicy {
  qualityProfile: ResolvedConfig["import"]["qualityProfile"];
  dropSuccessful: boolean;
  summaryMaxChars: number;
  strictSuccessfulToolResultMaxBytes: number;
}

export interface StrictImportNoiseState {
  seenSuccessfulToolResults: Set<string>;
}

export function createStrictImportNoiseState(): StrictImportNoiseState {
  return { seenSuccessfulToolResults: new Set<string>() };
}

export function resolveImportToolNoisePolicy(config: ResolvedConfig): ImportToolNoisePolicy {
  return {
    qualityProfile: config.import.qualityProfile,
    dropSuccessful: config.import.toolResults === "errors-only",
    summaryMaxChars: config.import.toolResultSummaryMaxChars,
    strictSuccessfulToolResultMaxBytes: STRICT_SUCCESSFUL_TOOL_RESULT_MAX_BYTES,
  };
}

export function importToolAllowed(
  name: string,
  filter: { include?: string[]; exclude?: string[] },
): boolean {
  if (filter.include && !filter.include.includes(name)) return false;
  return !filter.exclude?.includes(name);
}

function textFromToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (typeof content === "number" || typeof content === "boolean" || typeof content === "bigint")
    return String(content);
  if (!Array.isArray(content)) return JSON.stringify(content ?? "");
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part === "number" || typeof part === "boolean" || typeof part === "bigint")
        return String(part);
      if (part && typeof part === "object") {
        const record = part as Record<string, unknown>;
        if (typeof record.text === "string") return record.text;
        if (typeof record.content === "string") return record.content;
        if (typeof record.output === "string") return record.output;
      }
      return JSON.stringify(part ?? "");
    })
    .filter(Boolean)
    .join("\n");
}

function normalizedName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

const UI_NOISE_NAMES = new Set([
  "ui",
  "progress",
  "spinner",
  "toast",
  "notification",
  "render",
  "message_update",
  "extension_ui_request",
]);

const PROCESS_NOISE_NAMES = new Set([
  "process",
  "process-status",
  "status",
  "watcher",
  "watch",
  "ci-status",
  "check-status",
]);

const UI_NOISE_PATTERNS = [/\bspinner\b/i, /\btoast\b/i, /\bprogress ui\b/i, /\bmessage update\b/i];
const PROCESS_NOISE_PATTERNS = [
  /\brefreshing checks status\b/i,
  /\bchecks? (still )?pending\b/i,
  /\bwatcher (pending|continues|running)\b/i,
  /\bwaiting for ci\b/i,
  /\bprocess status\b/i,
];

function messageTypeNames(message: Record<string, unknown>): string[] {
  return [message.type, message.customType, message.event, message.kind]
    .map(normalizedName)
    .filter(Boolean);
}

export function summarizeToolResultContent(content: unknown, maxChars: number): string {
  const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function successfulToolResultFingerprint(name: string, contentText: string): string {
  return createHash("sha256")
    .update(name)
    .update("\0")
    .update(contentText.trim().replace(/\s+/g, " "))
    .digest("hex");
}

export function strictSuccessfulToolResultDropReason(
  message: Record<string, unknown>,
  policy: ImportToolNoisePolicy,
  state: StrictImportNoiseState,
): ImportNoiseDropReason | undefined {
  if (policy.qualityProfile !== "strict") return undefined;
  if (message.role !== "toolResult" || message.isError === true) return undefined;

  const toolName = normalizedName(message.name ?? message.toolName ?? message.tool);
  const typeNames = messageTypeNames(message);
  const contentText = textFromToolResultContent(message.content);
  const contentBytes = Buffer.byteLength(contentText, "utf8");
  const combined = `${toolName}\n${typeNames.join("\n")}\n${contentText}`;

  if (UI_NOISE_NAMES.has(toolName) || typeNames.some((type) => UI_NOISE_NAMES.has(type)))
    return "ui-noise";
  if (
    PROCESS_NOISE_NAMES.has(toolName) ||
    typeNames.some((type) => PROCESS_NOISE_NAMES.has(type)) ||
    matchesAny(combined, PROCESS_NOISE_PATTERNS)
  ) {
    return "process-noise";
  }
  if (matchesAny(combined, UI_NOISE_PATTERNS)) return "ui-noise";
  if (!contentText.trim()) return "tool-result-empty";
  if (contentBytes > policy.strictSuccessfulToolResultMaxBytes) return "oversized-output";

  const fingerprint = successfulToolResultFingerprint(toolName, contentText);
  if (state.seenSuccessfulToolResults.has(fingerprint)) return "repeated-output";
  state.seenSuccessfulToolResults.add(fingerprint);
  return undefined;
}
