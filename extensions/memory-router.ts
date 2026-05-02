import type { ResolvedConfig } from "./types.js";

export type MemoryRoute = "project" | "global" | "both" | "skip";

export interface MemoryRouteDecision {
  route: MemoryRoute;
  confidence: number;
  reason: string;
  mode: ResolvedConfig["globalRetain"]["mode"];
  writes: string[];
}

const GLOBAL_PATTERNS = [
  /\b(prefer|prefers|preference|likes|wants|always|never)\b/i,
  /\b(name|nick|nickname|identity|male|female|pronouns?)\b/i,
  /\b(workflow|habit|communication style|response style|across projects|global)\b/i,
];

const PROJECT_PATTERNS = [
  /\b(repo|project|file|path|module|test|bug|fix|architecture|config|implementation)\b/i,
  /\b(PR|issue|commit|branch|importer|extension|TUI|API)\b/,
];

const SKIP_PATTERNS = [/\/var\/folders\//i, /\btemporary\b/i, /\bscreenshot\b/i];

function matchesAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content));
}

export function routeMemoryCandidate(args: {
  content: string;
  context?: string;
  config: ResolvedConfig;
}): MemoryRouteDecision {
  const text = `${args.content}\n${args.context ?? ""}`;
  const global = matchesAny(text, GLOBAL_PATTERNS);
  const project = matchesAny(text, PROJECT_PATTERNS);
  const skip = matchesAny(text, SKIP_PATTERNS);

  const route: MemoryRoute = skip
    ? "skip"
    : global && project
      ? "both"
      : global
        ? "global"
        : project
          ? "project"
          : "skip";
  const confidence = skip
    ? 0.9
    : global && !project
      ? 0.85
      : project && !global
        ? 0.8
        : global && project
          ? 0.65
          : 0.4;
  const writes =
    args.config.globalRetain.mode === "router"
      ? route === "both"
        ? ["project", "global"]
        : route === "skip"
          ? []
          : [route]
      : [];
  const reason =
    args.config.globalRetain.mode === "explicit-only"
      ? `dry-run only: globalRetain.mode=explicit-only; suggested=${route}`
      : `router mode: suggested=${route}`;

  return { route, confidence, reason, mode: args.config.globalRetain.mode, writes };
}
