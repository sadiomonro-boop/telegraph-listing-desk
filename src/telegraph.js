// Telegraph client: talks to the official @telegraphprotocol MCP server as a
// subprocess over stdio and buys intelligence from vetted miners.
//
// Payment: escrow only (TELEGRAPH_PAYMENT=escrow). The server is started with
// TELEGRAPH_MAX_BUDGET_USDC=0 so even a routed ask could only ever use one
// miner — but this module never places routed asks at all (see config.js).
// The private key is never read from a file here: it must already be in the
// TELEGRAPH_PRIVATE_KEY environment variable, set by the operator from their
// own throwaway wallet. This module never prints it.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ASK_TIMEOUT_MS, INTENTS } from "./config.js";

const require = createRequire(import.meta.url);
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const serverEntry = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "@telegraphprotocol", "telegraph-protocol-mcp", "dist", "index.js");

// Build the exact ask body for one intent, from a listing application.
// `app` fields: contractAddress, chain, projectName, legalName, xHandle,
// sourceCode, tokenSymbol.
export function askBodyFor(key, app) {
  const address = app.contractAddress;
  switch (key) {
    case "audit":
      return {
        question:
          `Audit the ERC20 token contract ${address} (${app.tokenSymbol || "token"}) on ${app.chain} ` +
          `for security risks: honeypot, mint and burn flags, ownership and proxy status, ` +
          `buy/sell taxes, open-source status. Report each finding.`,
      };
    case "holder":
      return { params: { token: address, chain: app.chain } };
    case "sanctions":
      return { params: { name: app.legalName || app.projectName } };
    case "social":
      return { params: { account: app.xHandle } };
    case "code":
      return { params: { code: app.sourceCode } };
    case "wash":
      return { params: { subject: `${app.tokenSymbol || "token"} ${address} on ${app.chain}` } };
    default:
      throw new Error(`Unknown intent key: ${key}`);
  }
}

// One MCP tool call with a generous timeout. Paid asks can take over a minute;
// the SDK default (60 s) is too short and aborts asks that are still running.
async function callTool(client, name, args, timeoutMs = ASK_TIMEOUT_MS) {
  const started = Date.now();
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
  const text = result.content.map((c) => c.text).join("\n");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { parsed, isError: !!result.isError, ms: Date.now() - started };
}

export class TelegraphClient {
  constructor(env = process.env) {
    if (!env.TELEGRAPH_PRIVATE_KEY) {
      throw new Error(
        "TELEGRAPH_PRIVATE_KEY is not set. Export the throwaway wallet key first " +
          "(see README: fund the throwaway wallet, never a real one).",
      );
    }
    this.env = env;
    this.client = null;
  }

  async connect() {
    const env = {
      ...this.env,
      TELEGRAPH_PAYMENT: "escrow",
      TELEGRAPH_MAX_BUDGET_USDC: "0",
      TELEGRAPH_MAX_ASK_USD: "0.5",
      TELEGRAPH_DAILY_LIMIT_USD: "5",
    };
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      env,
      stderr: "ignore",
    });
    this.client = new Client({ name: "listing-desk", version: "1.0.0" });
    await this.client.connect(transport);
    return this;
  }

  async close() {
    try {
      await this.client?.close();
    } catch {
      // already closed
    }
    this.client = null;
  }

  async account() {
    const { parsed, isError } = await callTool(this.client, "telegraph_account", {}, 30000);
    if (isError) throw new Error(`telegraph_account failed: ${JSON.stringify(parsed).slice(0, 300)}`);
    return parsed;
  }

  // Free, live intent discovery: only intents with ranked miners are buyable.
  async discoverIntent(intentName) {
    const { parsed, isError } = await callTool(this.client, "telegraph_intent", { intent: intentName }, 30000);
    if (isError) return { intent: intentName, miners: 0, live: false, error: JSON.stringify(parsed).slice(0, 200) };
    // Note: the tool reports the count as `miners`, not `miner_count`.
    const count = parsed.miners ?? parsed.miner_count ?? 0;
    return { intent: parsed.intent, miners: count, live: count > 0, topRanked: parsed.top_ranked ?? null };
  }

  async findMiners(intentName, limit = 5) {
    const { parsed, isError } = await callTool(this.client, "telegraph_find_miners", { intent: intentName, limit }, 30000);
    if (isError) return [];
    return (parsed.miners || []).map((m) => ({ id: String(m.id), slug: m.slug, rank: m.rank ?? null, score: m.score ?? null, priceUsd: m.price_usd ?? null }));
  }

  // Buy ONE intent from ONE miner. Returns the node's reply verbatim plus
  // timing. Throws on transport errors; a node error reply (e.g. HTTP 503)
  // is returned as { ok: false } so the caller can try the next miner.
  async askMiner(key, miner, app) {
    const cfg = INTENTS[key];
    const body = askBodyFor(key, app);
    const started = Date.now();
    let reply;
    try {
      reply = await callTool(this.client, "telegraph_ask_miner", { miner: miner.id, intent: cfg.intent, ...body });
    } catch (e) {
      return { ok: false, key, miner, error: `transport: ${e.message}`, ms: Date.now() - started };
    }
    const { parsed, isError } = reply;
    if (isError) {
      const detail = parsed?.error || parsed?.message || JSON.stringify(parsed).slice(0, 300);
      return { ok: false, key, miner, error: `node ${parsed?.status ?? ""} ${detail}`.trim(), ms: Date.now() - started };
    }
    return {
      ok: true,
      key,
      intent: cfg.intent,
      miner: { id: String(miner.id), slug: miner.slug, name: parsed.miner ?? miner.slug },
      answer: parsed.answer ?? null,
      resultShape: parsed.result_shape ?? null,
      fieldStatus: parsed.field_status ?? null,
      costUsd: parsed.cost_usd ?? null,
      receipt: parsed.payment?.receipt ?? null,
      billedUsd: parsed.payment?.billed_usd ?? parsed.cost_usd ?? null,
      warnings: parsed.warnings ?? [],
      ms: Date.now() - started,
    };
  }

  // Buy one intent: try each vetted miner in order until one returns an
  // on-target answer. `isOnTarget` is the caller's validator. A miner that
  // errors, or answers off-target, is skipped and recorded; the next miner
  // is tried. Returns the winning purchase plus the full attempt log.
  async buyIntent(key, app, isOnTarget) {
    const attempts = [];
    for (const miner of INTENTS[key].miners) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const bought = await this.askMiner(key, miner, app);
        if (!bought.ok) {
          attempts.push({ miner: miner.slug, attempt, ok: false, error: bought.error, ms: bought.ms });
          // A 503 means the node could not route right now: retry once, then move on.
          if (!/503|could not route/i.test(bought.error)) break;
          continue;
        }
        const check = isOnTarget(key, bought.answer, app);
        attempts.push({ miner: miner.slug, attempt, ok: true, onTarget: check.onTarget, reasons: check.reasons, costUsd: bought.costUsd, receiptHash: bought.receipt?.receipt_hash ?? null, ms: bought.ms });
        if (check.onTarget) return { ...bought, attempts };
        // Off-target answer (the known routing failure mode, bounties #187):
        // do not pay for a second try of the same miner — move to the next.
        break;
      }
    }
    return { ok: false, key, attempts, error: `All vetted miners for ${INTENTS[key].intent} failed or answered off-target.` };
  }
}
