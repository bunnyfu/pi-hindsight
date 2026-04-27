import type { HindsightLikeClient } from "./types.js";

const DEFAULT_PROJECT_REFLECT_MISSION =
  "Help a Pi coding agent recall project-specific engineering decisions, conventions, tasks, and debugging lessons.";

const DEFAULT_PROJECT_RETAIN_MISSION =
  "Extract durable project facts, user preferences, decisions, bugs, and lessons from raw Pi coding sessions. Ignore transient chatter and secrets.";

const DEFAULT_GLOBAL_REFLECT_MISSION =
  "Help a Pi coding agent recall durable cross-project user preferences, workflows, habits, and assistant behavior guidance.";

const DEFAULT_GLOBAL_RETAIN_MISSION =
  "Extract durable cross-project user preferences, recurring workflows, coding habits, and stable assistant behavior from raw Pi sessions. Ignore project-local implementation details unless they generalize.";

export interface BankMissionConfig {
  mission?: string;
  enableObservations?: boolean;
}

export async function ensureProjectBank(
  client: HindsightLikeClient,
  bankId: string,
  config: BankMissionConfig = {},
): Promise<void> {
  if (!client.createBank) return;
  await client.createBank(bankId, {
    name: bankId,
    reflectMission: config.mission ?? DEFAULT_PROJECT_REFLECT_MISSION,
    retainMission: config.mission ?? DEFAULT_PROJECT_RETAIN_MISSION,
    retainExtractionMode: "concise",
    enableObservations: config.enableObservations ?? true,
  });
}

export async function ensureGlobalBank(
  client: HindsightLikeClient,
  bankId: string,
  config: BankMissionConfig = {},
): Promise<void> {
  if (!client.createBank) return;
  await client.createBank(bankId, {
    name: bankId,
    reflectMission: config.mission ?? DEFAULT_GLOBAL_REFLECT_MISSION,
    retainMission: config.mission ?? DEFAULT_GLOBAL_RETAIN_MISSION,
    retainExtractionMode: "concise",
    enableObservations: config.enableObservations ?? true,
  });
}
