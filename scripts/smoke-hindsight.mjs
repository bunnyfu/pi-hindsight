#!/usr/bin/env node
import { HindsightClient } from "@vectorize-io/hindsight-client";

function envValue(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const baseUrl = envValue("HINDSIGHT_BASE_URL") ?? "http://localhost:8888";
const apiKey = envValue("HINDSIGHT_API_KEY");
const bankId = envValue("PI_HINDSIGHT_SMOKE_BANK_ID") ?? `pi-hindsight-smoke-${Date.now()}`;
const marker = `pi-hindsight-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const client = new HindsightClient({
  baseUrl,
  ...(apiKey ? { apiKey } : {}),
  userAgent: "pi-hindsight-smoke/0.1.0",
});

function log(step, data = {}) {
  console.log(JSON.stringify({ step, ...data }));
}

try {
  log("start", { baseUrl, bankId });
  await client.createBank(bankId, {
    name: bankId,
    reflectMission: "Smoke-test bank for Pi Hindsight extension development.",
    retainMission:
      "Retain exact smoke-test markers as durable facts. Preserve marker strings verbatim.",
    retainExtractionMode: "verbose",
    enableObservations: true,
  });
  log("bank_ok");

  await client.retain(bankId, `Smoke marker: ${marker}`, {
    context: "Pi Hindsight smoke test",
    documentId: `pi-smoke:${marker}`,
    updateMode: "append",
    tags: ["source:pi", "test:smoke"],
    metadata: { marker },
  });
  log("retain_ok", { marker });

  const recall = await retry(
    async () =>
      client.recall(bankId, marker, {
        budget: "mid",
        maxTokens: 1000,
        tags: ["test:smoke"],
        tagsMatch: "any_strict",
        includeSourceFacts: true,
        maxSourceFactsTokens: 2000,
      }),
    (result) => JSON.stringify(result).includes(marker),
    Number(process.env.HINDSIGHT_SMOKE_ATTEMPTS ?? 20),
    2000,
  );
  log("recall_ok", { containsMarker: JSON.stringify(recall).includes(marker) });

  const reflection = await client.reflect(bankId, `What smoke marker was retained? ${marker}`, {
    budget: "low",
    tags: ["test:smoke"],
    tagsMatch: "any_strict",
  });
  log("reflect_ok", { responsePreview: JSON.stringify(reflection).slice(0, 300) });

  log("success", { bankId, marker });
} catch (error) {
  console.error(
    JSON.stringify({
      step: "failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
}

async function retry(fn, predicate, attempts, delayMs) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await fn();
    if (predicate(last)) return last;
    log("recall_wait", { attempt, delayMs });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(
    `recall did not contain retained marker after ${attempts} attempts: ${JSON.stringify(last).slice(0, 1000)}`,
  );
}
