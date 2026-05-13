export function firstArg(args: unknown): string | undefined {
  if (Array.isArray(args)) return typeof args[0] === "string" ? args[0] : undefined;
  if (typeof args === "string") return args.split(/\s+/).filter(Boolean)[0];
  return undefined;
}

export function firstNonFlagArg(args: unknown): string | undefined {
  return argList(args).find((arg) => !arg.startsWith("--"));
}

export function secondArg(args: unknown): string | undefined {
  if (Array.isArray(args)) return typeof args[1] === "string" ? args[1] : undefined;
  if (typeof args === "string") return args.split(/\s+/).filter(Boolean)[1];
  return undefined;
}

export function argList(args: unknown): string[] {
  if (Array.isArray(args)) return args.filter((arg): arg is string => typeof arg === "string");
  if (typeof args === "string") return args.split(/\s+/).filter(Boolean);
  return [];
}

export function sessionFile(ctx: {
  sessionManager?: { getSessionFile?: () => string | undefined };
}): string | undefined {
  return ctx.sessionManager?.getSessionFile?.();
}

export function completeValues(argumentPrefix: string, values: string[]) {
  const prefix = argumentPrefix.trimStart();
  if (prefix.includes(" ")) return null;
  return values
    .filter((value) => value.startsWith(prefix))
    .map((value) => ({ value, label: value }));
}

export function completeFlags(argumentPrefix: string, flags: string[]) {
  const trimmed = argumentPrefix.trimStart();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const completingNewToken = trimmed.endsWith(" ");
  const current = completingNewToken ? "" : (parts.at(-1) ?? "");
  if (current && !current.startsWith("--")) return null;
  const used = new Set(parts.filter((part) => flags.includes(part)));
  const prefixParts = completingNewToken ? parts : parts.slice(0, -1);
  return flags
    .filter((flag) => !used.has(flag) && flag.startsWith(current))
    .map((flag) => {
      const value = [...prefixParts, flag].join(" ");
      return { value, label: flag };
    });
}

export function compactText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, Math.max(0, maxLength - 1))}…`;
}
