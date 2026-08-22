import { redactError } from "./sanitize.js";

/**
 * Headless stderr diagnostics.
 *
 * Print/JSON/RPC modes and CI pipes have no TUI, so `ctx.ui.notify` is a no-op there
 * and retain failures used to vanish without a trace. These helpers mirror the most
 * important lifecycle failures to stderr with a stable `pi-hindsight:` prefix so
 * they show up in captured pi output (watchdog logs, journald, shell pipes).
 *
 * Interactive TUI sessions suppress stderr writes — they would corrupt the terminal —
 * and keep using UI notifications instead. Debug traces are opt-in via
 * PI_HINDSIGHT_DEBUG=1 and are suppressed in TTY mode for the same reason.
 */
export function logHeadless(message: string): void {
  if (process.stdout.isTTY) return;
  try {
    process.stderr.write(`pi-hindsight: ${message}\n`);
  } catch {
    // stderr can be closed in exotic harnesses; diagnostics must never throw.
  }
}

export function logHeadlessError(context: string, error: unknown): void {
  logHeadless(`${context}: ${redactError(error)}`);
}

export function logDebug(message: string): void {
  if (process.env.PI_HINDSIGHT_DEBUG !== "1") return;
  logHeadless(`[debug] ${message}`);
}
