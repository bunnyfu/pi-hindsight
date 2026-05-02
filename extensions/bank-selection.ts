import type { ResolvedConfig } from "./types.js";

export function resolveOperationBank(args: {
  requestedBank: string | undefined;
  config: ResolvedConfig;
  projectBankId: string;
}): string {
  const requested = args.requestedBank?.trim();
  if (!requested || requested === "project") return args.projectBankId;
  if (requested === "global") {
    if (!args.config.banks.global.enabled)
      throw new Error("Global Hindsight bank is disabled. Enable banks.global first.");
    if (!args.config.banks.global.bankId)
      throw new Error("Global Hindsight bank ID is not configured.");
    return args.config.banks.global.bankId;
  }
  return requested;
}
