#!/usr/bin/env node
// Listing desk CLI.
//
//   node src/cli.js --input examples/usdc.json --out out/usdc
//   node src/cli.js --input examples/dai.json --out out/dai --mode sniper
//
// One command: validates the application, discovers the live intents, buys
// the five (memo) or three (sniper) intents in parallel from vetted miners
// through Telegraph escrow, validates every answer is on-target, scores the
// risk, and writes a memo (memo.md) plus machine-readable evidence
// (evidence.json) into the output directory.
//
// Exit codes: 0 = memo produced (LIST / REVIEW / NO-LIST, or sniper
// BUY / NO-BUY / REVIEW); 1 = INCONCLUSIVE (invalid input, or an intent
// could not be bought after all fallbacks). An inconclusive run still writes
// its memo — it documents the failure instead of faking a success.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TelegraphClient } from "./telegraph.js";
import { INTENTS, MEMO_INTENTS, SNIPER_INTENTS } from "./config.js";
import { validateAnswer, validateApplication } from "./validate.js";
import { scoreMemo } from "./score.js";
import { composeInconclusive, composeMemo, renderInconclusiveMarkdown, renderMemoMarkdown } from "./memo.js";

export const VERSION = "1.0.0";

function parseArgs(argv) {
  const out = { input: null, outDir: "out", mode: "memo" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") out.input = argv[++i];
    else if (argv[i] === "--out") out.outDir = argv[++i];
    else if (argv[i] === "--mode") out.mode = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") out.help = true;
  }
  return out;
}

const HELP = `telegraph-listing-desk v${VERSION} — autonomous listings desk (Mission 01 Exchange)

Usage:
  node src/cli.js --input <application.json> [--out <dir>] [--mode memo|sniper]

Environment:
  TELEGRAPH_PRIVATE_KEY   throwaway wallet key (Sepolia testnet only).
                          The wallet must hold test USDC in Telegraph escrow
                          (see README). Never use a real wallet.

Modes:
  memo    buy 5 intents (audit, holder, sanctions, social, code) -> LIST / REVIEW / NO-LIST
  sniper  buy 3 intents (audit, wash, holder) -> BUY / NO-BUY / REVIEW

Exit codes: 0 memo produced, 1 INCONCLUSIVE (invalid input or a failed purchase).
`;

export async function run(argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.input) {
    process.stdout.write(HELP);
    return args.help ? 0 : 2;
  }
  const startedAt = new Date().toISOString();
  const runInfo = { startedAt, finishedAt: null, version: VERSION, mode: args.mode };
  mkdirSync(args.outDir, { recursive: true });
  const writeOutputs = (memo, markdown) => {
    writeFileSync(join(args.outDir, "evidence.json"), JSON.stringify(memo, null, 2) + "\n");
    writeFileSync(join(args.outDir, "memo.md"), markdown + "\n");
  };
  const fail = (reason, attempts, memoApp = null) => {
    const memo = composeInconclusive({ app: memoApp, reason, attempts, run: { ...runInfo, finishedAt: new Date().toISOString() } });
    writeOutputs(memo, renderInconclusiveMarkdown(memo));
    process.stderr.write(`INCONCLUSIVE: ${reason}\n`);
    return 1;
  };

  let app;
  try {
    app = JSON.parse(readFileSync(args.input, "utf8"));
  } catch (e) {
    return fail(`Could not read application JSON: ${e.message}`);
  }
  const inputErrors = validateApplication(app);
  if (inputErrors.length) {
    const memo = composeInconclusive({ app, reason: `Invalid listing application: ${inputErrors.join("; ")}`, attempts: [], run: { ...runInfo, finishedAt: new Date().toISOString() } });
    writeOutputs(memo, renderInconclusiveMarkdown(memo));
    process.stderr.write(`INCONCLUSIVE: invalid application: ${inputErrors.join("; ")}\n`);
    return 1;
  }
  if (args.mode !== "memo" && args.mode !== "sniper") {
    return fail(`Unknown mode "${args.mode}" (use memo or sniper).`, [], app);
  }
  const keys = args.mode === "sniper" ? SNIPER_INTENTS : MEMO_INTENTS;

  const ClientClass = deps.TelegraphClient || TelegraphClient;
  let client;
  try {
    client = new ClientClass();
    await client.connect();
  } catch (e) {
    return fail(`Could not connect to Telegraph: ${e.message}`, [], app);
  }

  try {
    // Runtime intent discovery: only buy intents that are live with miners.
    // Canonical short names (SMART_CONTRACT_AUDIT etc.) have zero miners and
    // are never bought — the _GENERAL variants in config.js are the live ones.
    const discovery = {};
    for (const key of keys) {
      discovery[key] = await client.discoverIntent(INTENTS[key].intent);
      if (!discovery[key].live) {
        return fail(`Intent ${INTENTS[key].intent} has no live miners right now; refusing to buy a dead intent.`, [discovery[key]], app);
      }
    }
    // Live ranks for the memo (best-effort: ranking may be unranked for an epoch).
    // The rank shown is the ANSWERING miner's rank, not the primary's: when a
    // fallback miner answers, its own rank is what the memo must show.
    const minerLists = {};
    for (const key of keys) {
      minerLists[key] = await client.findMiners(INTENTS[key].intent, 5);
    }

    const accountBefore = await client.account().catch(() => null);
    const purchases = await Promise.all(
      keys.map((key) => client.buyIntent(key, app, validateAnswer)),
    );
    const accountAfter = await client.account().catch(() => null);
    const failed = purchases.filter((p) => !p.ok);
    if (failed.length) {
      const attempts = failed.flatMap((f) => (f.attempts || []).map((a) => ({ key: f.key, ...a })));
      return fail(
        `Could not buy ${failed.map((f) => INTENTS[f.key].intent).join(", ")} after all vetted miners and retries. No memo was scored.`,
        attempts,
        app,
      );
    }
    const ranks = {};
    for (const p of purchases) {
      const found = (minerLists[p.key] || []).find((m) => m.id === p.miner.id);
      ranks[p.key] = found ? { rank: found.rank, score: found.score } : { rank: null, score: null };
    }

    const scoring = scoreMemo(Object.fromEntries(purchases.map((p) => [p.key, p])));
    let verdict = scoring.verdict;
    if (args.mode === "sniper") {
      verdict = scoring.verdict === "LIST" ? "BUY" : scoring.verdict === "NO-LIST" ? "NO-BUY" : "REVIEW";
    }
    const memo = composeMemo({
      app,
      purchases,
      scoring: { ...scoring, verdict },
      mode: args.mode,
      ranks,
      run: {
        ...runInfo,
        finishedAt: new Date().toISOString(),
        escrowBeforeUsdc: accountBefore?.escrow?.spendable_usdc ?? null,
        escrowAfterUsdc: accountAfter?.escrow?.spendable_usdc ?? null,
      },
    });
    writeOutputs(memo, renderMemoMarkdown(memo));
    process.stdout.write(
      `${verdict} — risk ${scoring.score}/100 — ${memo.totalCostUsdc.toFixed(2)} test USDC — ${keys.length} intents — memo: ${join(args.outDir, "memo.md")}\n`,
    );
    return 0;
  } finally {
    await client.close();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`Fatal: ${e?.message || e}\n`);
      process.exit(1);
    },
  );
}
