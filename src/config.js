// Shared configuration for the listings desk.
//
// Network: Ethereum Sepolia (testnet) only. All money is Telegraph test USDC.
// Spending caps mirror the Telegraph defaults: $0.50 per ask, $5 per day.
// The desk never places a routed ask (telegraph_ask): on unranked intents the
// node falls back to a general model and bills the whole $0.26 budget for a
// generic answer (observed 25 Nov 2026). Every purchase is a direct call to
// one vetted miner (telegraph_ask_miner, $0.01 each, receipt hash included).
export const NODE_URL = "https://devnode.telegraphprotocol.com";
export const CHAIN_ID = 11155111; // Ethereum Sepolia
export const USDC_TOKEN = "0xcc194e1a843B658526D0D5C431f670028582Ae17"; // Telegraph test USDC, NOT Circle's
export const ESCROW_DIAMOND = "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b";
export const MAX_ASK_USD = 0.5;
export const DAILY_LIMIT_USD = 5;
export const ASK_TIMEOUT_MS = 120000;
export const EPOCH_EXPLORER = "https://sepolia.etherscan.io";

// One entry per Mission 01 concept. `miners` is a fallback chain: the first
// miner that returns an on-target answer wins. All miners were vetted live on
// 25 Nov 2026 via telegraph_find_miners (active, $0.01, requests served).
// Ranks/scores are the live per-intent ranks from that probe.
export const INTENTS = {
  audit: {
    intent: "SMART_CONTRACT_AUDIT_GENERAL",
    label: "Contract audit",
    miners: [
      { id: "200001", slug: "goplus-security", note: "GoPlus token security, 804 requests served" },
      { id: "151007", slug: "sca-ghsa", note: "GitHub security advisories audit, 28 requests served" },
      { id: "151009", slug: "sca-zenodo", note: "Zenodo smart contract audit records, 8 requests served" },
    ],
  },
  holder: {
    intent: "TOKEN_HOLDER_COUNT_GENERAL",
    label: "Holder concentration",
    miners: [
      { id: "4433", slug: "livecert", note: "Rank 1, score 0.816, 1,187 requests served" },
      { id: "774921", slug: "verireceipt", note: "Rank 2, score 0.7555, deterministic, SHA-256 receipt" },
      { id: "9002", slug: "txlens", note: "Rank 4, score 0.384, 2,968 requests served" },
    ],
  },
  sanctions: {
    intent: "SANCTIONS_SCREENING_MATCH_GENERAL",
    label: "Sanctions screening",
    miners: [
      { id: "710637", slug: "zk-sanctions", note: "Score 1.0, 1,428 requests served" },
      { id: "84392", slug: "kimutai-sanctions-screener", note: "Rank 1, score 1.0, 18 requests served" },
      { id: "78004", slug: "san-os-ofac", note: "Rank 2, score 1.0, OFAC SDN index" },
    ],
  },
  social: {
    intent: "SOCIAL_BOT_DETECTION_GENERAL",
    label: "Social bot detection",
    miners: [
      // The only live miner that assesses a real X/Twitter-style account.
      // Wikimedia and Hacker News miners serve the same intent but answer
      // about the wrong platforms, so they are not listed as fallbacks.
      { id: "7457", slug: "tradewire-social-bot-detection", note: "Score 0.9673, 30 requests served" },
    ],
  },
  code: {
    intent: "CODE_REVIEW_GENERAL",
    label: "Code review",
    miners: [
      { id: "1900999004", slug: "codewire-code-review", note: "Rank 1, score 1.0 — intermittently unroutable (HTTP 503)" },
      { id: "7310045", slug: "zk-codereview", note: "Score 1.0, 361 requests served — verified fallback" },
    ],
  },
  wash: {
    intent: "WASH_TRADING_DETECTION_GENERAL",
    label: "Wash-trading detection",
    miners: [
      // Status 25 Nov 2026: NO live miner returns a usable wash verdict for
      // an address-only query. wash-dex-search returns a raw DexScreener
      // pairs dump with no verdict; chainsight-oracle proxies the same dump;
      // rugburn-wash-trading is Solana-only (node 422 for EVM tokens);
      // txlens answers "Insufficient data" and asks for trade records.
      // Sniper mode therefore ends INCONCLUSIVE on the wash intent until a
      // miner that judges wash trading from an address exists. The desk
      // refuses to fake a verdict from these answers.
      { id: "80002", slug: "wash-dex-search", note: "Rank 1, score 0.8457 — returns pairs dump, no verdict" },
      { id: "9002", slug: "txlens", note: "Rank 4 — answers 'insufficient data' for address-only queries" },
    ],
  },
};

// The five intents bought for every listing memo, in order.
export const MEMO_INTENTS = ["audit", "holder", "sanctions", "social", "code"];
// The three intents bought for sniper (pre-trade) mode.
export const SNIPER_INTENTS = ["audit", "wash", "holder"];
