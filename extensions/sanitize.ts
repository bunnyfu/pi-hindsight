const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[REDACTED]"],
  [/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED_API_KEY]"],
  [/\b(ghp_[A-Za-z0-9_]{12,})\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [
    /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*)[^\s\n"',}]+/gi,
    "$1[REDACTED]",
  ],
  [/(https?:\/\/)([^\s/@]+):([^\s/@]+)@/gi, "$1[REDACTED]@"],
];

export function redactSecrets(input: string): string {
  return SECRET_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    input,
  );
}
