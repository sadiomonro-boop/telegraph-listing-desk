# Demo video script (2–3 min) — Telegraph Listing Desk

Shot list for the parent-side video assembly. All commands are real; the
transcripts below are copied from actual runs on 25 Nov 2026 (Sepolia testnet).

## 0:00–0:20 — The problem
- "An exchange listings team gets a token application. Checking it takes hours
  of analyst time: contract audit, holder analysis, sanctions screening,
  social checks, code review."
- Show `examples/usdc.json` (the application: contract, chain, X handle,
  legal name, source excerpt).

## 0:20–0:50 — One command
- Run: `node src/cli.js --input examples/usdc.json --out out/usdc`
- Transcript (real):
  ```
  REVIEW — risk 50/100 — 0.05 test USDC — 5 intents — memo: out/usdc/memo.md
  ```
- "Five paid asks through Telegraph, five cents of test USDC, about a minute."

## 0:50–1:40 — The memo
- Show `out/usdc/memo.md`: REVIEW, 50/100; the findings table with miner,
  rank, receipt hash, cost per check.
- Highlight two real catches: the code review found the blacklist in the
  supplied excerpt is written but never enforced; GoPlus data shows proxy 1
  and top-10 holders at 23%.
- Show `evidence.json`: receipt hashes, the fallback trail (CodeWire 503
  twice → zk-codereview answered), escrow before/after, verification hash.

## 1:40–2:10 — The failure case (honest)
- Run with an invalid address:
  ```
  $ node src/cli.js --input bad.json --out out/bad
  INCONCLUSIVE: invalid application: contractAddress "0x1234" is not a valid EVM address
  $ echo $?
  1
  ```
- "An invalid application, or an intent that cannot be bought, produces an
  INCONCLUSIVE memo and a non-zero exit code. It never fakes a success."
- Note the sniper-mode gap honestly: no live miner returns a usable
  wash-trading verdict for an address-only query, so sniper ends
  INCONCLUSIVE on the wash intent.

## 2:10–2:30 — Reproduce it
- "Clone the repo, npm install, fund a throwaway Sepolia wallet with test
  USDC, export TELEGRAPH_PRIVATE_KEY, run the same command. Caps: $0.50 per
  ask, $5 per day. Testnet only."
- End card: repo URL + demo page URL.

## Screenshots to capture
1. Terminal: the USDC run (REVIEW line).
2. `memo.md` findings table.
3. `evidence.json`: one receipt hash + verification hash.
4. Terminal: the failure case (INCONCLUSIVE, exit 1).
