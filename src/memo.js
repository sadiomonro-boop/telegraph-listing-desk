// Memo composition: turns validated purchases + risk score into a signed
// listing risk memo (Markdown) and machine-readable JSON evidence.
//
// The memo carries, per intent: intent name, miner id/slug, rank (from the
// live discovery at run time), score where the network reports one, the
// Telegraph receipt hash, the billed cost, and a trimmed answer excerpt.
// The total cost line is in test USDC. The verification hash is SHA-256 over
// the canonical JSON of the memo body — anyone can recompute it from the
// evidence file. It is our own hash, not a chain hash: the node returns a
// receipt hash per ask (Telegraph epoch settlement), and that is what we cite.
import { createHash } from "node:crypto";
import { INTENTS } from "./config.js";

const trimAnswer = (answer, n = 1200) => {
  const s = typeof answer === "string" ? answer : JSON.stringify(answer);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

export function verificationHash(body) {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export function composeMemo({ app, purchases, scoring, mode, ranks, run }) {
  const totalCost = purchases.reduce((s, p) => s + Number(p.billedUsd ?? p.costUsd ?? 0), 0);
  const body = {
    kind: mode === "sniper" ? "pre-trade-check" : "listing-risk-memo",
    network: "Ethereum Sepolia (testnet)",
    token: { contract: app.contractAddress, chain: app.chain, symbol: app.tokenSymbol || null, project: app.projectName },
    verdict: scoring.verdict,
    riskScore: scoring.score,
    critical: scoring.critical,
    rulesFired: scoring.fired,
    findings: purchases.map((p) => ({
      key: p.key,
      intent: p.intent,
      label: INTENTS[p.key].label,
      miner: { id: p.miner.id, slug: p.miner.slug, name: p.miner.name, rank: ranks?.[p.key]?.rank ?? null, score: ranks?.[p.key]?.score ?? null },
      receiptHash: p.receipt?.receipt_hash ?? null,
      receipt: p.receipt ?? null,
      costUsdc: Number(p.billedUsd ?? p.costUsd ?? 0),
      latencyMs: p.ms,
      warnings: p.warnings ?? [],
      // Full purchase trail: every miner tried, retries, off-target answers.
      // This is the evidence that fallbacks actually happened.
      attempts: (p.attempts ?? []).map((a) => ({ miner: a.miner, attempt: a.attempt, ok: a.ok, onTarget: a.onTarget ?? null, reasons: a.reasons ?? [], error: a.error ?? null, costUsd: a.costUsd ?? null, receiptHash: a.receiptHash ?? null, ms: a.ms })),
      answer: p.answer,
    })),
    totalCostUsdc: Math.round(totalCost * 1e6) / 1e6,
    run,
  };
  body.verificationHash = verificationHash(body);
  return body;
}

export function renderMemoMarkdown(memo) {
  const lines = [];
  lines.push(`# Listing Risk Memo — ${memo.token.project} (${memo.token.symbol || "token"})`);
  lines.push("");
  lines.push(`**Network:** ${memo.network} — testnet intelligence, test USDC only.`);
  lines.push(`**Token:** \`${memo.token.contract}\` on ${memo.token.chain}`);
  lines.push(`**Verdict:** ${memo.verdict} — risk score **${memo.riskScore}/100**`);
  if (memo.critical) lines.push(`**Critical finding:** ${memo.critical}`);
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  lines.push("| Check | Miner (rank) | Result | Receipt | Cost (test USDC) |");
  lines.push("|---|---|---|---|---|");
  for (const f of memo.findings) {
    const rank = f.miner.rank !== null && f.miner.rank !== undefined ? `rank ${f.miner.rank}` : "unranked";
    const result = summarizeFinding(f);
    lines.push(`| ${f.label} (${f.intent}) | ${f.miner.slug} (${rank}) | ${result} | \`${(f.receiptHash || "none").slice(0, 18)}…\` | ${f.costUsdc.toFixed(2)} |`);
  }
  lines.push("");
  lines.push("## Risk rules fired");
  lines.push("");
  if (memo.rulesFired.length === 0) lines.push("None — no risk rule fired.");
  else for (const r of memo.rulesFired) lines.push(`- (+${r.points}) ${r.rule}`);
  lines.push("");
  lines.push("## Evidence");
  lines.push("");
  for (const f of memo.findings) {
    lines.push(`### ${f.label} — ${f.miner.name}`);
    lines.push("");
    lines.push(`- Miner id: \`${f.miner.id}\`, receipt hash: \`${f.receiptHash || "none"}\`, latency: ${f.latencyMs} ms`);
    lines.push(`- Answer (trimmed): \`\`\`json\n${trimAnswer(f.answer)}\n\`\`\``);
    lines.push("");
  }
  lines.push(`**Total cost: ${memo.totalCostUsdc.toFixed(2)} test USDC** (Telegraph escrow, Sepolia testnet).`);
  lines.push("");
  lines.push(`**Verification hash (SHA-256 over this memo's JSON body):** \`${memo.verificationHash}\``);
  lines.push("");
  lines.push(`Generated ${memo.run.finishedAt} by telegraph-listing-desk v${memo.run.version}.`);
  return lines.join("\n");
}

function summarizeFinding(f) {
  const a = f.answer || {};
  switch (f.key) {
    case "audit": {
      const row = a.result ? a.result[Object.keys(a.result)[0]] : {};
      return `honeypot ${row.is_honeypot ?? "?"}, proxy ${row.is_proxy ?? "?"}, tax ${row.buy_tax ?? "?"}%/${row.sell_tax ?? "?"}%, holders ${row.holder_count ?? "?"}`;
    }
    case "holder":
      return `${a.holders_count ?? "?"} holders`;
    case "sanctions":
      return a.matched ? `MATCH (score ${a.match_score ?? "?"})` : `no match (score ${a.match_score ?? 0})`;
    case "social":
      return `verdict ${a.verdict ?? "?"}${typeof a.bot_score === "number" ? `, score ${a.bot_score}` : ""}`;
    case "code":
      return (a.summary || "no summary").slice(0, 120);
    case "wash":
      return `verdict ${a.verdict ?? "?"}${typeof a.wash_volume_pct === "number" ? `, wash ${a.wash_volume_pct}%` : ""}`;
    default:
      return "ok";
  }
}

// An INCONCLUSIVE memo: produced when the input is invalid or an intent
// cannot be bought after all fallbacks. It documents the failure, scores
// nothing, and must be paired with a non-zero exit code — never a fake success.
export function composeInconclusive({ app, reason, attempts, run }) {
  const body = {
    kind: "listing-risk-memo",
    network: "Ethereum Sepolia (testnet)",
    token: app ? { contract: app.contractAddress || null, chain: app.chain || null, project: app.projectName || null } : null,
    verdict: "INCONCLUSIVE",
    riskScore: null,
    critical: null,
    rulesFired: [],
    failure: { reason, attempts: attempts ?? [] },
    totalCostUsdc: 0,
    run,
  };
  body.verificationHash = verificationHash(body);
  return body;
}

export function renderInconclusiveMarkdown(memo) {
  return [
    `# Listing Risk Memo — INCONCLUSIVE`,
    ``,
    `**Network:** ${memo.network} — testnet intelligence, test USDC only.`,
    memo.token?.contract ? `**Token:** \`${memo.token.contract}\`` : `**Token:** (invalid application)`,
    `**Verdict:** INCONCLUSIVE — risk score: not computed`,
    ``,
    `## Failure`,
    ``,
    memo.failure.reason,
    ``,
    ...(memo.failure.attempts.length
      ? ["### Attempts", "", ...memo.failure.attempts.map((a) => `- ${a.key ?? a.miner ?? "?"}: ${a.error ?? JSON.stringify(a)}`), ""]
      : []),
    `**Total cost: 0.00 test USDC** (no intelligence was bought or trusted).`,
    ``,
    `**Verification hash (SHA-256 over this memo's JSON body):** \`${memo.verificationHash}\``,
    ``,
    `Generated ${memo.run.finishedAt} by telegraph-listing-desk v${memo.run.version}.`,
    ``,
  ].join("\n");
}
