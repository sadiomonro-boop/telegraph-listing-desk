# Telegraph Listing Desk

An autonomous listings desk for **Mission 01 Exchange** (Telegraph Hackathon
Season II, Apps & Agents track). Give it a token listing application; it buys
risk intelligence through the Telegraph network on testnet, validates every
answer, and composes a signed listing risk memo — **LIST / REVIEW / NO-LIST**
— with a risk score, per-intent findings, miner receipts, and a total cost
line. A second mode, **sniper** (pre-trade check, BUY / NO-BUY), is included
but currently unproven — see Known limitations.

> **Testnet only.** Everything runs on Ethereum Sepolia with Telegraph test
> USDC. No mainnet, no real money, no real wallets. All amounts below are
> test USDC.

## What it does

```
listing application (JSON)
  → validate input (no money spent on bad input)
  → discover live intents at runtime (only intents with ranked miners)
  → buy 5 intents in parallel, $0.01 each, from vetted miners
  → validate every answer is on-target (fall back to the next vetted miner)
  → score the risk (explainable rules, critical findings override)
  → memo.md + evidence.json (receipt hashes, verification hash)
```

| Check | Live intent | Vetted miner (25 Nov 2026) |
|---|---|---|
| Contract audit | `SMART_CONTRACT_AUDIT_GENERAL` (20 miners) | GoPlus Security `200001` |
| Holder concentration | `TOKEN_HOLDER_COUNT_GENERAL` (24) | LiveCert `4433` (rank 1, 0.816) |
| Sanctions screening | `SANCTIONS_SCREENING_MATCH_GENERAL` (31) | Sanctions Name Evidence `710637` |
| Social bot detection | `SOCIAL_BOT_DETECTION_GENERAL` (17) | TradeWire `7457` |
| Code review | `CODE_REVIEW_GENERAL` (18) | CodeWire `1900999004`, fallback zk-codereview `7310045` |

The canonical short names (`SMART_CONTRACT_AUDIT`, `SANCTIONS_SCREENING_MATCH`,
`CODE_REVIEW`, …) have **zero** live miners and are never bought. The desk
discovers the live `_GENERAL` variants at runtime and refuses to buy a dead
intent.

## Results (real paid runs, 25 Nov 2026)

| Application | Verdict | Risk | Cost |
|---|---|---|---|
| USD Coin (USDC) — `proofs/usdc/` | REVIEW | 50/100 | 0.05 test USDC |
| Dai Stablecoin (DAI) — `proofs/dai/` | REVIEW | 40/100 | 0.05 test USDC |

Both memos are real: every finding carries a Telegraph receipt hash
(`payment.receipt.receipt_hash`, epoch settlement) and the memo carries a
SHA-256 verification hash over its JSON body. The USDC memo's code review
caught a genuine flaw in the supplied excerpt (blacklist written but never
enforced); the DAI memo's review caught an unguarded `burn` in its excerpt.
The excerpts are applicant-supplied; the desk judges them as written.

Failure cases are first-class: an invalid address produces an INCONCLUSIVE
memo and exit code 1 (`proofs/failure-case/`). No fake success, ever.

## How to run

### Prerequisites

- Node.js 20+ and npm.
- A **throwaway** EVM wallet funded on Sepolia (see below). Never use a real
  wallet, never reuse a wallet that holds real funds.

### 1. Install

```bash
git clone https://github.com/sadiomonro-boop/telegraph-listing-desk.git
cd telegraph-listing-desk
npm install
```

### 2. Fund the throwaway wallet (testnet only)

1. Create a throwaway keypair (e.g. `npx viem` or any wallet generator) and
   keep the key in a file outside the repo, mode `0600`.
2. Get Sepolia ETH for gas (any public Sepolia faucet, e.g. the PoW faucet at
   https://sepolia-faucet.pk910.de/ — 0.05 ETH is more than enough).
3. Mint Telegraph test USDC (token
   `0xcc194e1a843B658526D0D5C431f670028582Ae17`, **not** Circle's USDC) by
   calling `mint(address, amount)` on it — anyone can mint it.
4. Deposit test USDC into the Telegraph escrow diamond
   `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b` (approve, then `depositUSDC`).
   5 test USDC covers ~100 memos. The official MCP server can do this step:
   `npx -y @telegraphprotocol/telegraph-protocol-mcp fund 5 --yes` with
   `TELEGRAPH_PRIVATE_KEY` set.

### 3. Run a memo

```bash
export TELEGRAPH_PRIVATE_KEY=0x...   # throwaway key only
node src/cli.js --input examples/usdc.json --out out/usdc
```

Expected output:

```
REVIEW — risk 50/100 — 0.05 test USDC — 5 intents — memo: out/usdc/memo.md
```

`out/usdc/memo.md` is the human memo; `out/usdc/evidence.json` is the
machine-readable evidence (answers, receipts, attempts, verification hash).

Try the second example:

```bash
node src/cli.js --input examples/dai.json --out out/dai
```

### Sniper mode (pre-trade check)

```bash
node src/cli.js --input examples/usdc.json --out out/sniper --mode sniper
```

Buys audit + wash-trading + holder count and answers BUY / NO-BUY / REVIEW.
Currently ends INCONCLUSIVE on the wash intent — see Known limitations.

### Tests

```bash
npm test   # 17 unit tests: discovery, validation, scoring, memo, failure case
```

## Spending limits and costs

- One memo: 5 asks × $0.01 = **0.05 test USDC**. Sniper: 3 × $0.01.
- Hard caps enforced by the MCP server: **$0.50 per ask, $5 per day**.
  The desk never places a routed ask, so it can never be billed the $0.26
  routed-ask budget (see below).
- Failed asks are never billed by the node. An ask that returns an unusable
  answer is billed ($0.01) — the desk records it as a failed attempt.
- Escrow balance before/after each run is recorded in `evidence.json`
  (`run.escrowBeforeUsdc` / `run.escrowAfterUsdc`).

## How it works (tutorial)

1. **Application.** A listing application is JSON: `contractAddress`,
   `chain`, `projectName`, `legalName`, `xHandle`, `tokenSymbol`,
   `sourceCode` (an excerpt of the token contract, supplied by the
   applicant), optional `treasuryAddresses`. See `examples/usdc.json`.
2. **Discovery.** Before spending anything, the desk calls the free
   `telegraph_intent` tool for each intent. An intent with no live miners
   aborts the run as INCONCLUSIVE — buying a dead intent is not an option.
3. **Purchase.** Each intent is bought with `telegraph_ask_miner` against
   one vetted miner id. Direct miner calls cost that miner's price ($0.01)
   and return a receipt hash. The five purchases run in parallel.
4. **Validation.** Each answer is checked to be on-target: the audit result
   must be keyed by the queried contract address; the holder count must be a
   positive number; the sanctions answer must name the screened entity; the
   social answer must be about the queried handle; the code review must have
   a real summary. An off-target answer is discarded and the next vetted
   miner is tried. If every miner fails, the memo is INCONCLUSIVE.
5. **Scoring.** Explainable rules (see `src/score.js`): honeypot or a
   sanctions match forces NO-LIST; high taxes, proxy upgradeability,
   concentrated top-10 holders, few holders, bot verdicts, and code-review
   weaknesses add points. 0–30 LIST, 31–59 REVIEW, 60+ NO-LIST.
6. **Memo.** `src/memo.js` renders the Markdown memo and the JSON evidence,
   including the full purchase trail (every miner tried, retries, errors)
   and a SHA-256 verification hash over the memo body.

## Known limitations (honest)

- **Routed asks are deliberately never used.** On 25 Nov 2026 a routed ask
  to `SMART_CONTRACT_AUDIT_GENERAL` (unranked) fell back to a general model
  that refused a live audit — and billed the full $0.26 budget for generic
  text. Direct miner calls ($0.01, receipt hash) avoid this entirely.
  (Related upstream report: bounties issue #187, PR Guard — routed asks can
  return answers that ignore the target.)
- **Routing quality varies by miner.** CodeWire (`1900999004`, rank 1 for
  code review) returned HTTP 503 "could not route this question now" on
  every attempt in our runs (six 503s across the probe and both E2E memos);
  the desk falls back to zk-codereview (`7310045`), which answered every
  time. The fallback trail is in the evidence.
- **Social bot detection is weak.** TradeWire is the only live miner that
  assesses a real X account, and it returns `inconclusive` with no score
  for large verified accounts. The memo scores that as +5 (no usable
  signal) rather than pretending it is evidence either way.
- **Wash-trading detection has no usable live miner (sniper mode
  unproven).** Tested 25 Nov 2026: wash-dex-search returns a raw DexScreener
  pairs dump with no verdict; chainsight-oracle proxies the same dump;
  rugburn-wash-trading is Solana-only (node 422 for EVM tokens); txlens
  answers "Insufficient data" and wants trade records, not an address.
  Sniper mode therefore ends INCONCLUSIVE on the wash intent. The code is
  shipped; the capability is not claimed.
- **Miner answers are the miners' opinions, not ground truth.** GoPlus data
  is live and structured; the code review is an LLM judgment of the excerpt
  supplied. The memo reports what each miner said, with its receipt, so a
  reviewer can check it.
- **No on-chain "signal hash" exists for these asks.** The verifiable
  receipt is the Telegraph receipt hash per ask (epoch settlement, e.g.
  epoch 53) plus the escrow spend log. The memo's verification hash is
  SHA-256 over the memo JSON — our hash, computed so anyone can recompute
  it from `evidence.json`. We do not claim it is a chain hash.
- **Testnet only.** All evidence is Sepolia testnet. Nothing here is
  mainnet-ready without re-pointing the node, token, and escrow addresses
  and re-vetting the miners on mainnet.
- **Demo video:** script and CLI transcripts are in `demo/`; the assembled
  video is a separate step.

## Evidence

- `proofs/usdc/` — USDC memo + evidence (REVIEW, 50/100, 0.05 test USDC)
- `proofs/dai/` — DAI memo + evidence (REVIEW, 40/100, 0.05 test USDC)
- `proofs/failure-case/` — invalid address → INCONCLUSIVE, exit 1
- `proofs/sniper-usdc/` — sniper attempt → INCONCLUSIVE on wash intent
  (documents the wash-miner gap above)
- Chain: mint tx
  `0x339c105b6f9549d9afe0cb1a3e176bb6e1767376b469600d102758feb19408a3`,
  escrow deposit tx
  `0x4c7bcf5875707fe5ddd4cf9ce99e9d517d34088fd20d5e59e2861c9e62bfd944`
  ([Sepolia Etherscan](https://sepolia.etherscan.io/address/0xC3DE67071907EA861DF12AabF6ac7807973faB4B)),
  throwaway wallet `0xC3DE67071907EA861DF12AabF6ac7807973faB4B`
  (testnet only, holds no real funds).

## Commercial summary

- **Buyer:** a token exchange's listings team — the people who decide
  whether a new token gets listed.
- **Problem frequency:** every listing application (dozens a week per
  exchange) currently needs hours of analyst time: contract checks, holder
  analysis, sanctions screening, social checks, code review.
- **Demo flow:** one command, one JSON application in, one signed memo out
  in about a minute, with receipts for every fact.
- **Cost:** 0.05 test USDC per memo on testnet (~$0.05 at mainnet USDC
  prices) versus hours of analyst time. The desk's own caps ($0.50/ask,
  $5/day) bound the spend.
- **Result:** a LIST / REVIEW / NO-LIST verdict with a risk score and
  checkable evidence — a reviewer can verify every line from the receipts
  instead of re-doing the work.

## License

MIT — see `LICENSE`.
