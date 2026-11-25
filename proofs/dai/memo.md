# Listing Risk Memo — Dai Stablecoin (DAI)

**Network:** Ethereum Sepolia (testnet) — testnet intelligence, test USDC only.
**Token:** `0x6b175474e89094c44da98b954eedeac495271d0f` on ethereum
**Verdict:** REVIEW — risk score **40/100**

## Findings

| Check | Miner (rank) | Result | Receipt | Cost (test USDC) |
|---|---|---|---|---|
| Contract audit (SMART_CONTRACT_AUDIT_GENERAL) | goplus-security (rank 6) | honeypot 0, proxy 0, tax 0%/0%, holders 753846 | `0x142fd23ef4a9cd84…` | 0.01 |
| Holder concentration (TOKEN_HOLDER_COUNT_GENERAL) | livecert (rank 1) | 802475 holders | `0xe4483439d9487596…` | 0.01 |
| Sanctions screening (SANCTIONS_SCREENING_MATCH_GENERAL) | zk-sanctions (rank 3) | no match (score 0) | `0xa84b3ca93cbb08ef…` | 0.01 |
| Social bot detection (SOCIAL_BOT_DETECTION_GENERAL) | tradewire-social-bot-detection (rank 5) | verdict inconclusive | `0xb46a073b598ef85c…` | 0.01 |
| Code review (CODE_REVIEW_GENERAL) | zk-codereview (rank 5) | The code is not correct as written. | `0xb1622796a31332bc…` | 0.01 |

## Risk rules fired

- (+15) top-10 holders own 38% of supply
- (+5) bot detection inconclusive (no usable signal)
- (+20) code review flags a correctness or security weakness

## Evidence

### Contract audit — GoPlus Security (id 200001)

- Miner id: `200001`, receipt hash: `0x142fd23ef4a9cd847fecf0f301c880fcf9ec680492db07092f1793780f047574`, latency: 2814 ms
- Answer (trimmed): ```json
{"code":1,"message":"OK","result":{"0x6b175474e89094c44da98b954eedeac495271d0f":{"anti_whale_modifiable":"0","buy_tax":"0","can_take_back_ownership":"0","cannot_buy":"0","creator_address":"0xb5b06a16621616875a6c2637948bf98ea57c58fa","creator_balance":"0","creator_percent":"0.000000","external_call":"0","hidden_owner":"0","holder_count":"753846","holders":[{"address":"0xf6e72db5454dd049d0788e411b06cfaf16853042","balance":"795480787.498737270548465826","is_contract":1,"is_locked":0,"percent":"0.182482944008931748","tag":""},{"address":"0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf","balance":"432934415.74132500624411655","is_contract":1,"is_locked":0,"percent":"0.099314965224586519","tag":""},{"address":"0x250ba4e73a365cefdd170a2b1ff9fc03097d64f3","balance":"155000200","is_contract":1,"is_locked":0,"percent":"0.035556977946520325","tag":""},{"address":"0x8932fe7726c1ee743f662f485c3e5a5d1d595f71","balance":"51474901.324627116248062421","is_contract":1,"is_locked":0,"percent":"0.011808319803452358","tag":""},{"address":"0x4dedf26112b3ec8ec46e7e31ea5e123490b05b8b","balance":"51301109.203459244790773662","is_contract":1,"is_locked":0,"percent":"0.011768451967026050","tag":""},{"address":"0…
```

### Holder concentration — LiveCert — Sourced Answers for Agents (id 4433)

- Miner id: `4433`, receipt hash: `0xe4483439d9487596c73e86c8b07e238c289cda48aa9c1c6bd6432e12384bfb5d`, latency: 3394 ms
- Answer (trimmed): ```json
{"token":null,"chain":null,"holders_count":802475,"token_symbol":null}
```

### Sanctions screening — Sanctions Name Evidence (id 710637)

- Miner id: `710637`, receipt hash: `0xa84b3ca93cbb08ef240576580c46aa05b0d87bef57e2ef2ed6b9f61105812e2b`, latency: 9941 ms
- Answer (trimmed): ```json
{"name":"MakerDAO","matched":false,"matches":null,"lists":["OFAC SDN","OFAC Consolidated (non-SDN)","UK Sanctions List (entities only)","Canada autonomous sanctions (entities only)","EU Financial Sanctions (entities only)","US BIS Entity List (export controls)","US BIS Military End User List (export controls)","US BIS Denied Persons List (dated standard export-denial orders)","UK Sanctions List (ships)","US BIS Entity List (additional primary-row corroborated records)","Canada autonomous sanctions (November 5 additional entities)","Canada autonomous sanctions (corroborated ships)","Canada autonomous sanctions (November 5 Iranian entity amendment)"],"match_score":0}
```

### Social bot detection — TradeWire Social Bot Detection (id 7457)

- Miner id: `7457`, receipt hash: `0xb46a073b598ef85c4c11874842843f1b5b3dc098f87a2c0096396b5dbbf8ea22`, latency: 6388 ms
- Answer (trimmed): ```json
{"account":"@MakerDAO","verdict":"inconclusive","bot_score":null,"signals":null}
```

### Code review — CodeWire Code Review Request Contract (id 7310045)

- Miner id: `7310045`, receipt hash: `0xb1622796a31332bce49bc84d69bb31b87e12a98b1685073146a97229e08658a2`, latency: 23246 ms
- Answer (trimmed): ```json
{"verdict":null,"findings":["The code is not correct as written.","`burn` has a missing authorization check.","`transfer` has an incorrect external interface.","The contract relies on `add` and `sub`, which are likely internal arithmetic helpers.","There is no zero-address validation for `usr` or `dst`.","The `supply` accounting is only correct if every balance mutation is paired with exactly one matching `supply` mutation and no other code changes `dai` without adjusting `supply`.","The code provides no event emissions for minting, burning, or transfers.","The function signatures also use a lowercase `dai` identifier for storage, while `usr` and `wad` are untyped semantically beyond their Solidity types.","Finally, the code does not show the definitions of `auth`, `transferFrom`, `add`, `sub`, or the `dai` and `supply` state variables."],"summary":"The code is not correct as written."}
```

**Total cost: 0.05 test USDC** (Telegraph escrow, Sepolia testnet).

**Verification hash (SHA-256 over this memo's JSON body):** `f59415aa898addd96aea00ba52024163cbd68fe9158cbe2dce612ed26b008429`

Generated 2026-11-25T05:59:07.573Z by telegraph-listing-desk v1.0.0.
