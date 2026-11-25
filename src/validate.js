// Answer validation: every miner answer must be on-target before the desk
// trusts it. This is the mandatory mitigation for the known live-network
// failure mode (bounties issue #187, PR Guard): a routed ask can return an
// answer that ignores the queried target entirely. A direct miner call can
// also miss — e.g. a miner that answers about a different token, or returns
// empty fields. An off-target answer is never scored; the desk tries the
// next vetted miner instead, and if none is on-target the intent fails and
// the memo is INCONCLUSIVE.
//
// Each check returns { onTarget: boolean, reasons: string[] }.

const has = (v) => v !== null && v !== undefined && v !== "";
const norm = (s) => String(s ?? "").toLowerCase();
const contains = (hay, needle) => norm(hay).includes(norm(needle));

export function validateAnswer(key, answer, app) {
  const reasons = [];
  if (answer === null || answer === undefined) return { onTarget: false, reasons: ["empty answer"] };
  const addr = norm(app.contractAddress);

  switch (key) {
    case "audit": {
      // GoPlus returns { code, message, result: { "<address>": {...} } }.
      // On-target iff the result is keyed by the queried contract address.
      const result = answer.result;
      if (!result || typeof result !== "object") {
        reasons.push("audit answer has no result object");
        break;
      }
      const keys = Object.keys(result).map(norm);
      if (!keys.some((k) => k === addr)) {
        reasons.push(`audit result is about ${keys[0] || "nothing"}, not ${app.contractAddress}`);
        break;
      }
      const row = result[Object.keys(result).find((k) => norm(k) === addr)];
      if (!has(row.is_honeypot) && !has(row.holder_count)) {
        reasons.push("audit row has no security fields");
        break;
      }
      return { onTarget: true, reasons: ["audit row keyed by queried contract address"] };
    }
    case "holder": {
      if (typeof answer.holders_count !== "number" || !(answer.holders_count > 0)) {
        reasons.push(`holders_count is not a positive number (got ${JSON.stringify(answer.holders_count)})`);
        break;
      }
      return { onTarget: true, reasons: [`holders_count=${answer.holders_count}`] };
    }
    case "sanctions": {
      if (typeof answer.matched !== "boolean") {
        reasons.push("sanctions answer has no boolean matched field");
        break;
      }
      const screened = app.legalName || app.projectName;
      if (!contains(answer.name, screened) && !contains(screened, answer.name)) {
        reasons.push(`sanctions answer names "${answer.name}", not "${screened}"`);
        break;
      }
      return { onTarget: true, reasons: [`screened "${answer.name}", matched=${answer.matched}`] };
    }
    case "social": {
      if (typeof answer.verdict !== "string" || !answer.verdict) {
        reasons.push("social answer has no verdict");
        break;
      }
      const want = norm(app.xHandle).replace(/^@/, "");
      const got = norm(answer.account).replace(/^@/, "");
      if (got !== want) {
        reasons.push(`social answer is about "${answer.account}", not "${app.xHandle}"`);
        break;
      }
      return { onTarget: true, reasons: [`verdict=${answer.verdict} for ${answer.account}`] };
    }
    case "code": {
      if (typeof answer.summary !== "string" || answer.summary.trim().length < 20) {
        reasons.push("code review has no usable summary");
        break;
      }
      return { onTarget: true, reasons: ["review summary present"] };
    }
    case "wash": {
      if (typeof answer.verdict !== "string" || !answer.verdict) {
        reasons.push("wash-trading answer has no verdict");
        break;
      }
      if (!contains(answer.subject, app.contractAddress) && !contains(answer.subject, app.tokenSymbol || "")) {
        reasons.push(`wash answer subject "${answer.subject}" does not mention the token`);
        break;
      }
      return { onTarget: true, reasons: [`verdict=${answer.verdict}`] };
    }
    default:
      return { onTarget: false, reasons: [`unknown intent key ${key}`] };
  }
  return { onTarget: false, reasons };
}

// Validate a listing application before any money is spent.
export function validateApplication(app) {
  const errors = [];
  if (!app || typeof app !== "object") return ["application is not a JSON object"];
  if (!/^0x[0-9a-fA-F]{40}$/.test(app.contractAddress || "")) {
    errors.push(`contractAddress "${app.contractAddress}" is not a valid EVM address`);
  }
  if (typeof app.chain !== "string" || !app.chain.trim()) errors.push("chain is required (e.g. \"ethereum\")");
  if (typeof app.projectName !== "string" || !app.projectName.trim()) errors.push("projectName is required");
  if (typeof app.xHandle !== "string" || !/^@?[A-Za-z0-9_]{1,15}$/.test(app.xHandle.trim())) {
    errors.push(`xHandle "${app.xHandle}" is not a valid X handle`);
  }
  if (typeof app.sourceCode !== "string" || app.sourceCode.trim().length < 20) {
    errors.push("sourceCode is required (at least a 20-character excerpt of the token contract)");
  }
  if (app.treasuryAddresses !== undefined) {
    if (!Array.isArray(app.treasuryAddresses) || app.treasuryAddresses.some((a) => !/^0x[0-9a-fA-F]{40}$/.test(a))) {
      errors.push("treasuryAddresses must be an array of valid EVM addresses");
    }
  }
  return errors;
}
