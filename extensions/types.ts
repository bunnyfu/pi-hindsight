export type Budget = "low" | "mid" | "high";
export type UpdateMode = "append" | "replace";
export type TagsMatch = "any" | "all" | "any_strict" | "all_strict";
export type StatusStyle = "off" | "text" | "emoji" | "nerdfont";
export type StatusDetail = "minimal" | "project" | "activity" | "verbose";

export interface ResolvedConfig {
  enabled: boolean;
  hindsight: { baseUrl: string; apiKey?: string; timeoutMs: number };
  banks: {
    project: { enabled: boolean; bankId?: string; derive: "repo" | "cwd" | "manual" };
    global: { enabled: boolean; bankId?: string };
  };
  recall: {
    enabled: boolean;
    budget: Budget;
    maxTokens: number;
    types: string[];
    recentTurnsForQuery: number;
    injectionMode: "context";
    includeFactsInDebug: boolean;
  };
  retain: {
    enabled: boolean;
    async: boolean;
    updateMode: UpdateMode;
    includeToolResults: "meaningful-only" | "all" | "none";
    redactSecrets: boolean;
    queuePath: string;
  };
  import: {
    includeBranches: "current-only" | "all-leaves";
    includeCompactionSummaries: boolean;
    includeBranchSummaries: boolean;
    replaceExistingImportedDocs: boolean;
    manifestPath: string;
  };
  status: {
    style: StatusStyle;
    detail: StatusDetail;
    maxLength: number;
    showActivity: boolean;
  };
}

export interface BankSelection {
  projectBankId: string;
  globalBankId?: string;
}

export interface RecallResultItem {
  id?: string;
  text?: string;
  content?: string;
  type?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  occurred_start?: string | null;
}

export interface RecallBlock {
  bankId: string;
  query: string;
  rendered: string;
  memoryCount: number;
  results: RecallResultItem[];
}

export interface RetainJob {
  id: string;
  bankId: string;
  createdAt: string;
  documentId: string;
  updateMode: UpdateMode;
  item: {
    content: string;
    context: string;
    timestamp?: string;
    async?: boolean;
    tags?: string[];
    metadata?: Record<string, string>;
  };
  retries: number;
  lastError?: string;
}

export interface HindsightLikeClient {
  retain(
    bankId: string,
    content: string,
    options?: {
      timestamp?: Date | string;
      context?: string;
      metadata?: Record<string, string>;
      documentId?: string;
      async?: boolean;
      tags?: string[];
      updateMode?: UpdateMode;
    },
  ): Promise<unknown>;
  recall(
    bankId: string,
    query: string,
    options?: {
      types?: string[];
      maxTokens?: number;
      budget?: Budget;
      tags?: string[];
      tagsMatch?: TagsMatch;
    },
  ): Promise<unknown>;
  reflect(
    bankId: string,
    query: string,
    options?: {
      context?: string;
      budget?: Budget;
      tags?: string[];
      tagsMatch?: TagsMatch;
    },
  ): Promise<unknown>;
  createBank?(bankId: string, options?: Record<string, unknown>): Promise<unknown>;
  getBankProfile?(bankId: string): Promise<unknown>;
}
