// Unit tests: intent discovery mapping, answer validation, memo composition,
// scoring, and the failure case. No network, no wallet, no money.
import test from "node:test";
import assert from "node:assert/strict";
import { INTENTS, MEMO_INTENTS, SNIPER_INTENTS } from "../src/config.js";
import { validateAnswer, validateApplication } from "../src/validate.js";
import { scoreMemo } from "../src/score.js";
import { composeInconclusive, composeMemo, renderMemoMarkdown, verificationHash } from "../src/memo.js";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const app = {
  contractAddress: USDC,
  chain: "ethereum",
  projectName: "USD Coin",
  legalName: "Circle Internet Financial",
  xHandle: "@circle",
  tokenSymbol: "USDC",
  sourceCode: "function mint(address to, uint256 amount) public onlyOwner { _mint(to, amount); }",
};

// --- Intent discovery mapping ---
test("memo buys exactly the five live _GENERAL intents", () => {
  assert.deepEqual(MEMO_INTENTS, ["audit", "holder", "sanctions", "social", "code"]);
  for (const key of MEMO_INTENTS) {
    assert.ok(INTENTS[key].intent.endsWith("_GENERAL"), `${key} must use a live _GENERAL intent`);
    assert.ok(INTENTS[key].miners.length >= 1, `${key} needs at least one vetted miner`);
    assert.ok(INTENTS[key].miners.every((m) => m.id && m.slug), `${key} miners need id and slug`);
  }
});

test("canonical short intent names are never configured", () => {
  const configured = Object.values(INTENTS).map((i) => i.intent);
  for (const banned of ["SMART_CONTRACT_AUDIT", "SANCTIONS_SCREENING_MATCH", "CODE_REVIEW", "SOCIAL_BOT_DETECTION", "WASH_TRADING_DETECTION"]) {
    assert.ok(!configured.includes(banned), `${banned} has zero live miners and must never be bought`);
  }
});

test("sniper mode buys audit, wash and holder only", () => {
  assert.deepEqual(SNIPER_INTENTS, ["audit", "wash", "holder"]);
});

// --- Application validation ---
test("valid application passes; invalid address fails", () => {
  assert.deepEqual(validateApplication(app), []);
  assert.ok(validateApplication({ ...app, contractAddress: "0x1234" }).length > 0);
  assert.ok(validateApplication({ ...app, contractAddress: "not-an-address" }).length > 0);
  assert.ok(validateApplication({ ...app, xHandle: "not a handle!" }).length > 0);
  assert.ok(validateApplication({ ...app, sourceCode: "short" }).length > 0);
  assert.ok(validateApplication(null).length > 0);
});

// --- Answer validation ---
test("audit answer keyed by the queried contract is on-target; another address is not", () => {
  const good = { result: { [USDC]: { is_honeypot: "0", holder_count: "9479885" } } };
  assert.equal(validateAnswer("audit", good, app).onTarget, true);
  const wrong = { result: { "0x0000000000000000000000000000000000000000": { is_honeypot: "0", holder_count: "1" } } };
  assert.equal(validateAnswer("audit", wrong, app).onTarget, false);
  assert.equal(validateAnswer("audit", { result: {} }, app).onTarget, false);
  assert.equal(validateAnswer("audit", null, app).onTarget, false);
});

test("holder answer needs a positive holders_count", () => {
  assert.equal(validateAnswer("holder", { holders_count: 9635905 }, app).onTarget, true);
  assert.equal(validateAnswer("holder", { holders_count: 0 }, app).onTarget, false);
  assert.equal(validateAnswer("holder", { holders_count: "many" }, app).onTarget, false);
});

test("sanctions answer must name the screened entity and carry a boolean", () => {
  const good = { name: "Circle Internet Financial", matched: false, match_score: 0 };
  assert.equal(validateAnswer("sanctions", good, app).onTarget, true);
  assert.equal(validateAnswer("sanctions", { name: "Someone Else", matched: false }, app).onTarget, false);
  assert.equal(validateAnswer("sanctions", { name: "Circle Internet Financial" }, app).onTarget, false);
});

test("social answer must be about the queried handle with a verdict", () => {
  assert.equal(validateAnswer("social", { account: "@circle", verdict: "inconclusive" }, app).onTarget, true);
  assert.equal(validateAnswer("social", { account: "@circle", verdict: "bot", bot_score: 0.9 }, app).onTarget, true);
  assert.equal(validateAnswer("social", { account: "@other", verdict: "bot" }, app).onTarget, false);
  assert.equal(validateAnswer("social", { account: "@circle" }, app).onTarget, false);
});

test("code review needs a real summary; wash needs a verdict naming the token", () => {
  assert.equal(validateAnswer("code", { summary: "The code is functionally correct for a standard ERC-20 implementation." }, app).onTarget, true);
  assert.equal(validateAnswer("code", { summary: "ok" }, app).onTarget, false);
  assert.equal(validateAnswer("wash", { subject: `USDC ${USDC} on ethereum`, verdict: "clean" }, app).onTarget, true);
  assert.equal(validateAnswer("wash", { subject: "some other token", verdict: "clean" }, app).onTarget, false);
});

// --- Scoring ---
const cleanPurchases = {
  audit: { answer: { result: { [USDC]: { is_honeypot: "0", is_proxy: "1", is_open_source: "1", buy_tax: "0", sell_tax: "0", holder_count: "9479885", holders: [{ percent: "0.0419" }] } } } },
  holder: { answer: { holders_count: 9635905 } },
  sanctions: { answer: { name: "Circle Internet Financial", matched: false, match_score: 0 } },
  social: { answer: { account: "@circle", verdict: "inconclusive" } },
  code: { answer: { summary: "The code is functionally correct for a standard ERC-20 implementation." } },
};

test("clean token scores low and lists", () => {
  const s = scoreMemo(structuredClone(cleanPurchases));
  assert.equal(s.verdict, "LIST");
  assert.ok(s.score <= 30, `expected <=30, got ${s.score}`);
});

test("honeypot forces NO-LIST regardless of everything else", () => {
  const p = structuredClone(cleanPurchases);
  p.audit.answer.result[USDC].is_honeypot = "1";
  const s = scoreMemo(p);
  assert.equal(s.verdict, "NO-LIST");
  assert.ok(s.critical);
});

test("sanctions match forces NO-LIST", () => {
  const p = structuredClone(cleanPurchases);
  p.sanctions.answer.matched = true;
  p.sanctions.answer.match_score = 0.97;
  const s = scoreMemo(p);
  assert.equal(s.verdict, "NO-LIST");
  assert.ok(s.critical);
});

test("code review weakness in summary or findings adds risk", () => {
  const p = structuredClone(cleanPurchases);
  p.code.answer.summary = "The code is not fully correct.";
  p.code.answer.findings = ["The blacklist state is not enforced, a security-policy bypass."];
  const s = scoreMemo(p);
  assert.ok(s.score >= 20, `expected >=20, got ${s.score}`);
  assert.ok(s.fired.some((r) => r.rule.includes("code review")));
});

test("concentrated holders push the score up", () => {
  const p = structuredClone(cleanPurchases);
  p.audit.answer.result[USDC].holders = [{ percent: "0.4" }, { percent: "0.2" }];
  const s = scoreMemo(p);
  assert.ok(s.score >= 25, `expected >=25, got ${s.score}`);
});

// --- Memo composition ---
test("memo carries receipts, cost line and a verifiable hash", () => {
  const purchases = MEMO_INTENTS.map((key) => ({
    key,
    intent: INTENTS[key].intent,
    miner: { id: "1", slug: `miner-${key}`, name: `Miner ${key}` },
    answer: cleanPurchases[key].answer,
    receipt: { receipt_hash: `0x${key}hash` },
    billedUsd: 0.01,
    costUsd: 0.01,
    ms: 1234,
    warnings: [],
    attempts: [{ miner: `miner-${key}`, attempt: 1, ok: true, onTarget: true, reasons: ["ok"], costUsd: 0.01, receiptHash: `0x${key}hash`, ms: 1234 }],
  }));
  const scoring = scoreMemo(structuredClone(cleanPurchases));
  const memo = composeMemo({ app, purchases, scoring, mode: "memo", ranks: {}, run: { startedAt: "2026-11-25T00:00:00Z", finishedAt: "2026-11-25T00:01:00Z", version: "1.0.0" } });
  assert.equal(memo.verdict, "LIST");
  assert.equal(memo.totalCostUsdc, 0.05);
  assert.equal(memo.findings.length, 5);
  assert.ok(memo.findings.every((f) => f.receiptHash));
  assert.ok(memo.findings.every((f) => f.attempts && f.attempts.length === 1), "each finding must keep its purchase trail");
  const { verificationHash: h, ...body } = memo;
  assert.equal(verificationHash(body), h, "hash must recompute from the memo body");
  const md = renderMemoMarkdown(memo);
  assert.ok(md.includes("LIST"));
  assert.ok(md.includes("0.05 test USDC"));
  assert.ok(md.includes("0xaudithash"));
});

test("verification hash changes when the memo changes", () => {
  assert.notEqual(verificationHash({ a: 1 }), verificationHash({ a: 2 }));
});

// --- Failure case ---
test("inconclusive memo documents the failure and scores nothing", () => {
  const memo = composeInconclusive({ app, reason: "Intent X has no live miners", attempts: [], run: { startedAt: "x", finishedAt: "y", version: "1.0.0" } });
  assert.equal(memo.verdict, "INCONCLUSIVE");
  assert.equal(memo.riskScore, null);
  assert.equal(memo.totalCostUsdc, 0);
  assert.ok(memo.failure.reason.includes("no live miners"));
});
