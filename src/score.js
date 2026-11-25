// Risk scoring: turns the five validated miner answers into one 0-100 risk
// score and a LIST / REVIEW / NO-LIST verdict.
//
// The score is deliberately conservative and fully explainable: every point
// comes from a named rule below, and the memo lists each rule that fired.
// Critical findings (honeypot, sanctions match) override the score and force
// NO-LIST on their own. Thresholds: 0-30 LIST, 31-59 REVIEW, 60+ NO-LIST.
//
// All numbers are testnet intelligence about the applicant token; none of
// them is investment advice.

export function scoreMemo(findings) {
  const fired = [];
  let score = 0;
  let critical = null;

  const add = (points, rule) => {
    score += points;
    fired.push({ points, rule });
  };

  // --- 1. Contract audit (GoPlus row) ---
  const audit = findings.audit?.answer?.result;
  if (audit) {
    const row = audit[Object.keys(audit)[0]];
    if (row.is_honeypot === "1" || row.is_honeypot === 1) {
      critical = "Honeypot flag set by GoPlus security data.";
      add(100, "honeypot flag");
    }
    if (row.cannot_buy === "1" || row.cannot_buy === 1) {
      critical = "Token cannot be bought (GoPlus cannot_buy flag).";
      add(60, "cannot_buy flag");
    }
    const buyTax = Number(row.buy_tax ?? 0);
    const sellTax = Number(row.sell_tax ?? 0);
    if (buyTax > 10 || sellTax > 10) add(20, `high transfer tax (buy ${buyTax}%, sell ${sellTax}%)`);
    else if (buyTax > 5 || sellTax > 5) add(10, `transfer tax above 5% (buy ${buyTax}%, sell ${sellTax}%)`);
    if (row.is_proxy === "1" || row.is_proxy === 1) add(10, "upgradeable proxy contract (owner can change logic)");
    if (row.is_open_source === "0" || row.is_open_source === 0) add(15, "contract source not verified open-source");
    if (row.honeypot_with_same_creator === "1" || row.honeypot_with_same_creator === 1) {
      add(25, "creator previously deployed a honeypot");
    }
    // Holder concentration from the same GoPlus row (top-10 holders).
    const holders = Array.isArray(row.holders) ? row.holders : [];
    const top10 = holders.slice(0, 10).reduce((s, h) => s + Number(h.percent ?? 0), 0);
    findings.audit.top10SharePct = Math.round(top10 * 1000) / 10;
    if (top10 > 0.5) add(25, `top-10 holders own ${Math.round(top10 * 100)}% of supply`);
    else if (top10 > 0.2) add(15, `top-10 holders own ${Math.round(top10 * 100)}% of supply`);
    else if (top10 > 0.1) add(8, `top-10 holders own ${Math.round(top10 * 100)}% of supply`);
  }

  // --- 2. Holder count ---
  const holdersCount = findings.holder?.answer?.holders_count;
  if (typeof holdersCount === "number") {
    if (holdersCount < 100) add(20, `only ${holdersCount} holders`);
    else if (holdersCount < 1000) add(10, `only ${holdersCount} holders`);
  }

  // --- 3. Sanctions screening ---
  const sanc = findings.sanctions?.answer;
  if (sanc) {
    if (sanc.matched === true) {
      critical = `Sanctions-list match for "${sanc.name}" (score ${sanc.match_score ?? "?"}).`;
      add(100, "sanctions-list match");
    } else if (typeof sanc.match_score === "number" && sanc.match_score > 0.5) {
      add(30, `near sanctions match (score ${sanc.match_score})`);
    }
  }

  // --- 4. Social bot detection ---
  const bot = findings.social?.answer;
  if (bot) {
    const verdict = String(bot.verdict || "").toLowerCase();
    if (verdict === "bot" || verdict === "likely_bot" || verdict === "automated") add(20, "project account judged automated");
    else if (verdict === "inconclusive") add(5, "bot detection inconclusive (no usable signal)");
    if (typeof bot.bot_score === "number" && bot.bot_score > 0.7) add(20, `bot likelihood score ${bot.bot_score}`);
    else if (typeof bot.bot_score === "number" && bot.bot_score > 0.4) add(10, `bot likelihood score ${bot.bot_score}`);
  }

  // --- 5. Code review ---
  // Check the summary AND the findings list: reviewers often put the real
  // verdict in the findings while the summary stays mild.
  const reviewAnswer = findings.code?.answer;
  if (reviewAnswer) {
    const text = [reviewAnswer.summary, ...(Array.isArray(reviewAnswer.findings) ? reviewAnswer.findings : [])].filter((x) => typeof x === "string").join(" ").toLowerCase();
    if (/(critical|reentrancy|unchecked external|overflow|access control.*(missing|broken)|vulnerab|security-policy bypass|not fully correct|incorrect|bypass)/.test(text)) {
      add(20, "code review flags a correctness or security weakness");
    }
  }

  score = Math.max(0, Math.min(100, score));
  const verdict = critical ? "NO-LIST" : score >= 60 ? "NO-LIST" : score >= 31 ? "REVIEW" : "LIST";
  return { score, verdict, critical, fired };
}
