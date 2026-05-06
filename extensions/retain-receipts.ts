import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { redactSecrets } from "./sanitize.js";
import type { UpdateMode } from "./types.js";

export interface RetainReceipt {
  createdAt: string;
  bankId: string;
  documentId: string;
  queueJobId: string;
  updateMode: UpdateMode;
  source: "tool" | "import";
  context: string;
  tags: string[];
}

export interface RetainReceiptHistory {
  version: 1;
  receipts: RetainReceipt[];
}

const MAX_RECEIPTS = 50;
const MAX_RECEIPT_CONTEXT_CHARS = 1000;

export function retainReceiptsPath(cwd: string): string {
  return resolve(cwd, ".pi/hindsight/retain-receipts.json");
}

function emptyHistory(): RetainReceiptHistory {
  return { version: 1, receipts: [] };
}

export async function readRetainReceipts(path: string): Promise<RetainReceiptHistory> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<RetainReceiptHistory>;
    if (parsed.version !== 1 || !Array.isArray(parsed.receipts)) return emptyHistory();
    return { version: 1, receipts: parsed.receipts.filter(isRetainReceipt).slice(0, MAX_RECEIPTS) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHistory();
    return emptyHistory();
  }
}

function isRetainReceipt(value: unknown): value is RetainReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Record<string, unknown>;
  return (
    typeof receipt.createdAt === "string" &&
    typeof receipt.bankId === "string" &&
    typeof receipt.documentId === "string" &&
    typeof receipt.queueJobId === "string" &&
    (receipt.updateMode === "append" || receipt.updateMode === "replace") &&
    (receipt.source === "tool" || receipt.source === "import") &&
    typeof receipt.context === "string" &&
    Array.isArray(receipt.tags) &&
    receipt.tags.every((tag) => typeof tag === "string")
  );
}

export async function appendRetainReceipt(
  cwd: string,
  receipt: Omit<RetainReceipt, "createdAt"> & { createdAt?: string },
  options: { redactSecrets?: boolean; maxContextChars?: number } = {},
): Promise<RetainReceiptHistory> {
  const path = retainReceiptsPath(cwd);
  const current = await readRetainReceipts(path);
  const nextReceipt: RetainReceipt = {
    createdAt: receipt.createdAt ?? new Date().toISOString(),
    bankId: receipt.bankId,
    documentId: receipt.documentId,
    queueJobId: receipt.queueJobId,
    updateMode: receipt.updateMode,
    source: receipt.source,
    context: receiptContext(receipt.context, options),
    tags: receipt.tags,
  };

  function receiptContext(
    context: string,
    options: { redactSecrets?: boolean; maxContextChars?: number },
  ): string {
    const redacted = options.redactSecrets === false ? context : redactSecrets(context);
    const maxChars = options.maxContextChars ?? MAX_RECEIPT_CONTEXT_CHARS;
    if (redacted.length <= maxChars) return redacted;
    return `${redacted.slice(0, maxChars)}…[truncated]`;
  }
  const receipts = [
    nextReceipt,
    ...current.receipts.filter(
      (existing) =>
        existing.documentId !== nextReceipt.documentId || existing.bankId !== nextReceipt.bankId,
    ),
  ].slice(0, MAX_RECEIPTS);
  const history = { version: 1 as const, receipts };
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
  return history;
}

export async function listRetainReceipts(cwd: string, limit = 10): Promise<RetainReceipt[]> {
  const history = await readRetainReceipts(retainReceiptsPath(cwd));
  return history.receipts.slice(0, Math.max(0, limit));
}
