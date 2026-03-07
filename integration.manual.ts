/**
 * Manual integration test for BackendBackupClient
 *
 * Run with:
 *   npx tsx integration.manual.ts
 *
 * Fill in the three values below and run — it will exercise every SDK method
 * against the real backend and print full request/response details.
 */

import { BackendBackupClient } from "./src/backendClient";
import type { DebugInterceptor } from "./src/types";

// ===========================================================================
// ✏️  FILL THESE IN
// ===========================================================================

const BASE_URL = "https://tether-wallet-dev.tether.su/api/v1"; // your backend base URL
const AUTH_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0d19iMWI2MDg0MDk4MTdiZTcyNmRmZjA2YzdhZWYwN2EwMDQ3N2ZmMjRlODMzNzVlNjIwYTJhM2JhOTQyMjQzMTZhIiwiZW1haWwiOiJyYXZpLmxvZGhpQHRldGhlci5pbyIsImp0aSI6IjA2ZDYxYjI2LWQwZDAtNGFlZC05MjFjLWE4MWM5OWViMDY2YSIsInJlZnJlc2hKdGkiOiJmYzU3Y2FiZC1mZDY4LTQ5NGMtODY0ZS1hMjdmOTNlMjU0OTMiLCJpYXQiOjE3NzIwNTQyNTEsImV4cCI6MTc3MjA2MTQ1MX0.OcNuixroCdWtCuMrwy9x6un5OOpy4dgDHOyYaqRHSFc"; // paste your Bearer token here
const TEST_SEED = "test-encrypted-seed-" + Date.now();
const TEST_ENTROPY = "test-encrypted-entropy-" + Date.now();
const TEST_METADATA = { source: "manual-test", ts: Date.now() };

// ===========================================================================
// Debug interceptor — logs every request, response, and error
// ===========================================================================

const debug: DebugInterceptor = {
  onRequest: (info) => {
    console.log("\n─── REQUEST ───────────────────────────────────────");
    console.log(`  ${info.method} ${info.url}`);
    console.log("  Headers:", JSON.stringify(info.headers, null, 2));
    if (info.body && Object.keys(info.body).length > 0) {
      console.log("  Body:", JSON.stringify(info.body, null, 2));
    }
  },
  onResponse: (info) => {
    console.log("─── RESPONSE ──────────────────────────────────────");
    console.log(`  ${info.status} (${info.durationMs}ms)`);
    console.log("  Data:", JSON.stringify(info.data, null, 2));
    console.log("───────────────────────────────────────────────────\n");
  },
  onError: (info) => {
    console.log("─── ERROR ─────────────────────────────────────────");
    console.log(`  ${info.method} ${info.url} (${info.durationMs}ms)`);
    console.log(`  ${info.error.name}: ${info.error.message}`);
    console.log("───────────────────────────────────────────────────\n");
  },
};

// ===========================================================================
// Client
// ===========================================================================

const client = new BackendBackupClient({
  baseUrl: BASE_URL,
  timeoutMs: 15_000,
  retry: null, // disable retries so failures are immediate
  debug,
});

// ===========================================================================
// Test runner
// ===========================================================================

async function step(name: string, fn: () => Promise<void>) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  STEP: ${name}`);
  console.log("=".repeat(60));
  try {
    await fn();
    console.log(`  ✓ ${name} — PASSED`);
  } catch (err) {
    console.error(`  ✗ ${name} — FAILED`);
    console.error(" ", err);
  }
}

async function main() {
  if (!AUTH_TOKEN) {
    console.error("\n⚠️  Set AUTH_TOKEN before running.\n");
    process.exit(1);
  }

  console.log("Base URL   :", BASE_URL);
  console.log(
    "Auth token :",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0d19iMWI2MDg0MDk4MTdiZTcyNmRmZjA2YzdhZWYwN2EwMDQ3N2ZmMjRlODMzNzVlNjIwYTJhM2JhOTQyMjQzMTZhIiwiZW1haWwiOiJyYXZpLmxvZGhpQHRldGhlci5pbyIsImp0aSI6IjA2ZDYxYjI2LWQwZDAtNGFlZC05MjFjLWE4MWM5OWViMDY2YSIsInJlZnJlc2hKdGkiOiJmYzU3Y2FiZC1mZDY4LTQ5NGMtODY0ZS1hMjdmOTNlMjU0OTMiLCJpYXQiOjE3NzIwNTQyNTEsImV4cCI6MTc3MjA2MTQ1MX0.OcNuixroCdWtCuMrwy9x6un5OOpy4dgDHOyYaqRHSFc",
  );
  console.log("Test seed  :", TEST_SEED);
  console.log("Test entropy:", TEST_ENTROPY);

  // ── 1. GET seed (before upload — should be null or existing) ─────────
  await step("getSeed (before upload)", async () => {
    const seed = await client.getSeed(AUTH_TOKEN);
    console.log("  Result:", seed === null ? "<null — no backup>" : seed);
  });

  // ── 2. GET entropy (before upload — should be null or existing) ──────
  await step("getEntropy (before upload)", async () => {
    const entropy = await client.getEntropy(AUTH_TOKEN);
    console.log("  Result:", entropy === null ? "<null — no backup>" : entropy);
  });

  return;

  // ── 3. Upload seed ───────────────────────────────────────────────────
  await step("uploadSeed", async () => {
    await client.uploadSeed({
      seed: TEST_SEED,
      authToken: AUTH_TOKEN,
      metadata: TEST_METADATA,
    });
  });

  // ── 4. Upload entropy ────────────────────────────────────────────────
  await step("uploadEntropy", async () => {
    await client.uploadEntropy({
      entropy: TEST_ENTROPY,
      authToken: AUTH_TOKEN,
      metadata: TEST_METADATA,
    });
  });

  // ── 5. GET seed (after upload — should return the seed) ──────────────
  await step("getSeed (after upload)", async () => {
    const seed = await client.getSeed(AUTH_TOKEN);
    console.log("  Result:", seed);
    if (seed !== TEST_SEED) {
      console.warn(`  ⚠ Expected "${TEST_SEED}" but got "${seed}"`);
    }
  });

  // ── 6. GET entropy (after upload — should return the entropy) ────────
  await step("getEntropy (after upload)", async () => {
    const entropy = await client.getEntropy(AUTH_TOKEN);
    console.log("  Result:", entropy);
    if (entropy !== TEST_ENTROPY) {
      console.warn(`  ⚠ Expected "${TEST_ENTROPY}" but got "${entropy}"`);
    }
  });

  // ── 7. Delete backup ─────────────────────────────────────────────────
  await step("deleteBackup", async () => {
    await client.deleteBackup(AUTH_TOKEN);
  });

  // ── 8. GET seed (after delete — should be null again) ────────────────
  await step("getSeed (after delete)", async () => {
    const seed = await client.getSeed(AUTH_TOKEN);
    console.log("  Result:", seed === null ? "<null — deleted>" : seed);
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log("  DONE");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
