# Listing Risk Memo — USD Coin (USDC)

**Network:** Ethereum Sepolia (testnet) — testnet intelligence, test USDC only.
**Token:** `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` on ethereum
**Verdict:** REVIEW — risk score **50/100**

## Findings

| Check | Miner (rank) | Result | Receipt | Cost (test USDC) |
|---|---|---|---|---|
| Contract audit (SMART_CONTRACT_AUDIT_GENERAL) | goplus-security (rank 6) | honeypot 0, proxy 1, tax 0%/0%, holders 9479134 | `0xa535e8d17b68e44e…` | 0.01 |
| Holder concentration (TOKEN_HOLDER_COUNT_GENERAL) | livecert (rank 1) | 9635800 holders | `0xe85930999bc3e479…` | 0.01 |
| Sanctions screening (SANCTIONS_SCREENING_MATCH_GENERAL) | zk-sanctions (rank 3) | no match (score 0) | `0x3d81cea3054f3a7d…` | 0.01 |
| Social bot detection (SOCIAL_BOT_DETECTION_GENERAL) | tradewire-social-bot-detection (rank 5) | verdict inconclusive | `0xb4a2893066b08fb9…` | 0.01 |
| Code review (CODE_REVIEW_GENERAL) | zk-codereview (rank 5) | The code is not fully correct. The mint and burn flows are implemented correctly, but the blacklist function is incomple | `0xd936a3db8dbc41d5…` | 0.01 |

## Risk rules fired

- (+10) upgradeable proxy contract (owner can change logic)
- (+15) top-10 holders own 23% of supply
- (+5) bot detection inconclusive (no usable signal)
- (+20) code review flags a correctness or security weakness

## Evidence

### Contract audit — GoPlus Security (id 200001)

- Miner id: `200001`, receipt hash: `0xa535e8d17b68e44eadece8e73172c100ab7c570efc16ee3af772b356048d285b`, latency: 2501 ms
- Answer (trimmed): ```json
{"code":1,"message":"OK","result":{"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48":{"buy_tax":"0","cannot_buy":"0","creator_address":"0x95ba4cf87d6723ad9c0db21737d862be80e93911","creator_balance":"2505.454092","creator_percent":"0.000000","holder_count":"9479134","holders":[{"address":"0x37305b1cd40574e4c5ce33f8e8306be057fd7341","balance":"1861988304.590402","is_contract":0,"is_locked":0,"percent":"0.041995605158475142","tag":""},{"address":"0xffa69c0080582098af595156240214b742735a5e","balance":"1482999999.8601","is_contract":1,"is_locked":0,"percent":"0.033447837610260188","tag":""},{"address":"0xad354cfbaa4a8572dd6df021514a3931a8329ef5","balance":"1400000000.5201","is_contract":1,"is_locked":0,"percent":"0.031575841319068067","tag":""},{"address":"0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf","balance":"1056542959.049719","is_contract":1,"is_locked":0,"percent":"0.023829452006670614","tag":""},{"address":"0xe20d20b0cc4e44cd23d5b0488d5250a9ac426875","balance":"1000000000.395477","is_contract":0,"is_locked":0,"percent":"0.022554172371303686","tag":""},{"address":"0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c","balance":"919052461.868957","is_contract":1,"is_locked":0,"percent":"0.02072846…
```

### Holder concentration — LiveCert — Sourced Answers for Agents (id 4433)

- Miner id: `4433`, receipt hash: `0xe85930999bc3e479b0b16fe50d21ebf5808af398441e2307ae10a98b0b6d13fe`, latency: 3252 ms
- Answer (trimmed): ```json
{"token":null,"chain":null,"holders_count":9635800,"token_symbol":null}
```

### Sanctions screening — Sanctions Name Evidence (id 710637)

- Miner id: `710637`, receipt hash: `0x3d81cea3054f3a7d75675e8960711b3190b2da100ceda23e4b9cd5658bb287b1`, latency: 10755 ms
- Answer (trimmed): ```json
{"name":"Circle Internet Financial","matched":false,"matches":null,"lists":["OFAC SDN","OFAC Consolidated (non-SDN)","UK Sanctions List (entities only)","Canada autonomous sanctions (entities only)","EU Financial Sanctions (entities only)","US BIS Entity List (export controls)","US BIS Military End User List (export controls)","US BIS Denied Persons List (dated standard export-denial orders)","UK Sanctions List (ships)","US BIS Entity List (additional primary-row corroborated records)","Canada autonomous sanctions (November 5 additional entities)","Canada autonomous sanctions (corroborated ships)","Canada autonomous sanctions (November 5 Iranian entity amendment)"],"match_score":0}
```

### Social bot detection — TradeWire Social Bot Detection (id 7457)

- Miner id: `7457`, receipt hash: `0xb4a2893066b08fb964765f883aab4216ad6b518428c4301ac4ce6269bf2c9490`, latency: 6335 ms
- Answer (trimmed): ```json
{"account":"@circle","verdict":"inconclusive","bot_score":null,"signals":null}
```

### Code review — CodeWire Code Review Request Contract (id 7310045)

- Miner id: `7310045`, receipt hash: `0xd936a3db8dbc41d561cd28b54f16dbf261e8fbb1c32a3c1062905e18ffbd870d`, latency: 55065 ms
- Answer (trimmed): ```json
{"verdict":"Request changes","findings":["The mint and burn flows are implemented correctly, but the blacklist function is incomplete and the transfer function bypasses the blacklist logic.","The `transfer` function uses `_transfer` directly and returns `true` unconditionally. If `blacklisted` is intended to prevent blacklisted addresses from transferring tokens, this implementation does not enforce that rule. A blacklisted account can still transfer tokens, and a blacklisted recipient can still receive tokens.","The `blacklist` function has a correctness issue because it only sets `blacklisted[account] = true`; there is no corresponding unblacklist function or other mechanism to revoke a blacklist entry.","The `blacklist` function also lacks input validation. It permits the zero address to be blacklisted and permits duplicate calls, which may be harmless depending on the intended policy, but it should either reject the zero address or document that blacklisting it is valid.","The `transfer` function has a possible integration issue with ERC-20 override rules.","The `transfer` function can also return `true` even if the inherited token implementation changes `_transfer` to return …
```

**Total cost: 0.05 test USDC** (Telegraph escrow, Sepolia testnet).

**Verification hash (SHA-256 over this memo's JSON body):** `000e913306708ae99f4d3a06222aa1be282160d7374943477ca4b3726053d363`

Generated 2026-11-25T05:58:27.456Z by telegraph-listing-desk v1.0.0.
