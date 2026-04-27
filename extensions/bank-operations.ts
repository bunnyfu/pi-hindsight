import type { HindsightLikeClient } from "./types.js";

export async function ensureProjectBank(
  client: HindsightLikeClient,
  bankId: string,
): Promise<void> {
  if (!client.createBank) return;
  await client.createBank(bankId, {
    name: bankId,
    reflectMission:
      "Help a Pi coding agent recall project-specific engineering decisions, conventions, tasks, and debugging lessons.",
    retainMission:
      "Extract durable project facts, user preferences, decisions, bugs, and lessons from raw Pi coding sessions. Ignore transient chatter and secrets.",
    retainExtractionMode: "concise",
    enableObservations: true,
  });
}
