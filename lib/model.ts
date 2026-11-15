// Lucid Horizon radar-3: the value model and the farm plans.
//
// The model is the entry's own work. It reads only the sealed snapshot's own
// figures: a protocol's TVL, its seven-day TVL change, and how long DefiLlama
// has tracked it. It never ranks by a hardcoded list of names.
//
//   implied_value_usd = TVL x 0.30 x growth x maturity x chain x category
//
// * growth: from the 7-day TVL change, clamped to -50..+150 percent. A fall
//   is penalised harder than a rise is rewarded, because a protocol losing
//   TVL into a launch is worth less than one gaining it.
// * maturity: from the days since DefiLlama first listed the protocol. A
//   protocol that has run for years with no token has a deeper base of users
//   and integrations for a token to land on; a two-month-old one has not
//   proven it will still be here at launch.
// * chain: the best chain the protocol runs on. Deep, liquid chains where a
//   new token can actually trade are worth more than thin ones.
// * category: how much of the TVL a future token can claim. Protocols whose
//   token would take a direct fee on the TVL score higher; curators and
//   allocators take only a thin slice of the capital they direct, so they
//   score lower; a token that would sit on top of someone else's product
//   scores lowest of all.
//
// A protocol "records no token" when DefiLlama's record carries no token for
// it (both gecko_id and symbol null). That is a statement about the record,
// never a claim that the protocol has no token at all.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The share of TVL a launch is assumed to be able to claim. */
export const BASE_TVL_SHARE = 0.3;

/** A category the watchlist's own rule keeps out: a wrapped, staked or
 *  bridged product of a token that already trades, or a centralised venue. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_NAMES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** How much a token can claim, by chain: the deepest chains first. */
export const CHAIN_MULTIPLIERS: Record<string, number> = {
  Ethereum: 1.1,
  Solana: 1.08,
  Base: 1.07,
  Arbitrum: 1.06,
  Optimism: 1.05,
  'Hyperliquid L1': 1.05,
  Binance: 1.04,
  Avalanche: 1.04,
  Sui: 1.04,
  Polygon: 1.03,
  Monad: 1.03,
  Berachain: 1.02,
  Sonic: 1.02,
  TON: 1.01,
  Tron: 1.0,
  Bitcoin: 0.98,
  Flare: 0.95,
};

/** How much a token can claim, by category: a direct fee on the TVL first. */
export const CATEGORY_MULTIPLIERS: Record<string, number> = {
  Lending: 1.08,
  Dexs: 1.07,
  RWA: 1.07,
  Derivatives: 1.06,
  Yield: 1.05,
  'Yield Aggregator': 1.04,
  CDP: 1.04,
  Restaking: 1.04,
  'Basis Trading': 1.02,
  'Liquidity Manager': 1.02,
  Farm: 1.01,
  'Leveraged Farming': 1.01,
  'Anchor BTC': 0.99,
  'Decentralized BTC': 0.99,
  CeDeFi: 0.98,
  'Risk Curators': 0.95,
  'Onchain Capital Allocator': 0.95,
};

/** True when the snapshot's record shows no token for this protocol. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/**
 * True when the protocol is a wrapped, staked or bridged product of a token
 * that already trades, a centralised venue, or a versioned copy of another
 * protocol: the watchlist's own rule, applied to the whole board.
 */
export function isWrappedStakedOrBridged(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  for (const exchange of EXCHANGE_NAMES) {
    if (p.name.startsWith(exchange)) return true;
  }
  return false;
}

/** True when the protocol belongs on the board: it records no token and is
 *  not a wrapped, staked or bridged product of one that trades. */
export function isBoardEligible(p: SnapshotProtocol): boolean {
  return recordsNoToken(p) && !isWrappedStakedOrBridged(p);
}

/** Days between the snapshot date and the day DefiLlama first listed the
 *  protocol; null when the record carries no listing date. */
export function ageDays(p: SnapshotProtocol, asOf: Date): number | null {
  if (p.listed_at === null) return null;
  const listed = new Date(`${p.listed_at}T00:00:00Z`);
  return Math.max(0, Math.round((asOf.getTime() - listed.getTime()) / 86400000));
}

/**
 * Growth multiplier. The 7-day TVL change is clamped to -50..+150 percent;
 * a rise is rewarded at 0.6 per point, a fall penalised at 1.2 per point.
 * No reported change counts as flat.
 */
export function growthMultiplier(change7d: number | null): number {
  const change = change7d === null ? 0 : Math.max(-50, Math.min(150, change7d));
  return 1 + (change >= 0 ? 0.6 : 1.2) * (change / 100);
}

/**
 * Maturity multiplier. A protocol that has run three years with no token
 * scores 1.00; a brand-new one scores 0.70; the ramp is linear in between.
 * No listing date scores 0.80, the middle of the ramp's lower half.
 */
export function maturityMultiplier(p: SnapshotProtocol, asOf: Date): number {
  const age = ageDays(p, asOf);
  if (age === null) return 0.8;
  return 0.7 + 0.3 * (Math.min(age, 1095) / 1095);
}

/** Chain multiplier: the best chain the protocol runs on, capped at 1.10. */
export function chainMultiplier(chains: string[]): number {
  if (chains.length === 0) return 0.97;
  let best = 1.0;
  for (const chain of chains) {
    const value = CHAIN_MULTIPLIERS[chain] ?? 1.0;
    if (value > best) best = value;
  }
  return Math.min(best, 1.1);
}

/** Category multiplier: what a token can claim of the TVL, by category. */
export function categoryMultiplier(category: string | null): number {
  if (category === null) return 1.0;
  return CATEGORY_MULTIPLIERS[category] ?? 1.0;
}

export interface ModelParts {
  base: number;
  growth: number;
  maturity: number;
  chain: number;
  category: number;
}

/** The implied launch value and the multipliers that produced it. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: Date,
): { value: number; parts: ModelParts } {
  const parts: ModelParts = {
    base: BASE_TVL_SHARE,
    growth: growthMultiplier(p.change_7d),
    maturity: maturityMultiplier(p, asOf),
    chain: chainMultiplier(p.chains),
    category: categoryMultiplier(p.category),
  };
  const value = Math.round(
    p.tvl_usd * parts.base * parts.growth * parts.maturity * parts.chain * parts.category,
  );
  return { value, parts };
}

// ---------------------------------------------------------------- farm plans

/** What a transaction costs on a chain, in plain words. */
export function gasNote(chain: string): string {
  if (chain === 'Ethereum') return 'about $5–$20 in gas per transaction';
  if (chain === 'Solana' || chain === 'Sui' || chain === 'Flare') {
    return 'a few cents in gas per transaction';
  }
  if (chain === 'Bitcoin') return 'a few dollars in fees per transaction';
  if (chain === 'Tron') return 'a few dollars in energy fees per transaction';
  if (chain === 'Binance') return 'a few cents in gas per transaction';
  return 'under $1 in gas per transaction';
}

/** The protocol's main on-chain action, by category. */
function coreAction(p: SnapshotProtocol): string {
  const name = p.name;
  switch (p.category) {
    case 'Lending':
      return `Supply collateral on ${name} — start with about $100 in a major asset — then borrow a small amount against it; both supplying and borrowing count as activity.`;
    case 'Dexs':
      return `Swap $50–$100 through ${name} and add about $100 to a liquid pool; trading volume and liquidity provision are the two activities most DEX farms reward.`;
    case 'RWA':
      return `Buy or deposit about $100 into ${name}'s tokenized asset and hold it for at least a month; these farms reward staying power more than size.`;
    case 'Derivatives':
      return `Open a small $50–$100 position on ${name} with low leverage and close it after a few days; a modest, well-managed trade beats a large reckless one.`;
    case 'Yield':
      return `Deposit about $100 into ${name}'s main vault and leave it earning for at least two weeks; vaults reward time in the vault more than size alone.`;
    case 'Yield Aggregator':
      return `Deposit about $100 into ${name}'s auto-compounding vault and leave it for at least two weeks; the compounder's fee history is your activity record.`;
    case 'CDP':
      return `Lock about $100 of collateral on ${name} and mint a small amount of its stablecoin; keep the collateral ratio healthy so you are never liquidated.`;
    case 'Restaking':
      return `Restake about $100 of ETH or a liquid staking token through ${name}; restaking is a long game, so plan to leave it for a month or more.`;
    case 'Risk Curators':
      return `Deposit about $100 into a curated vault on ${name} and leave it allocated for at least two weeks; curators reward depositors who stay through a full allocation cycle.`;
    case 'Onchain Capital Allocator':
      return `Allocate about $100 through ${name}'s vaults and leave it for at least two weeks; allocators reward capital that stays put through a full cycle.`;
    case 'Basis Trading':
      return `Deposit about $100 into ${name}'s basis vault; basis trades earn from funding rates, so a few weeks of exposure is the minimum worth doing.`;
    case 'Liquidity Manager':
      return `Deposit about $100 into a managed liquidity position on ${name} and leave it for at least two weeks; managed positions reward patience over frequent moves.`;
    case 'Farm':
      return `Deposit about $100 into ${name}'s farm and harvest rewards weekly; regular harvests build a visible history of use.`;
    case 'Leveraged Farming':
      return `Open a small leveraged farm on ${name} with $50–$100 and low leverage; watch the health factor daily, because leverage cuts both ways.`;
    case 'Anchor BTC':
    case 'Decentralized BTC':
      return `Deposit a small amount of BTC, about $100 worth, into ${name}; BTC vaults move slowly, so plan for weeks, not days.`;
    case 'CeDeFi':
      return `Deposit about $100 through ${name}'s CeDeFi vault and read the custodian terms first; CeDeFi mixes on-chain and off-chain risk.`;
    default:
      return `Use ${name}'s main feature with about $100 and leave the position open for at least two weeks; steady use is what most farms reward.`;
  }
}

/**
 * Six concrete steps to farm a protocol: research, funding, the core
 * action, a repeat, the community trail, and the exit plan. Every step
 * names what to do, what it costs and how long it takes.
 */
export function farmSteps(p: SnapshotProtocol): string[] {
  const name = p.name;
  const chain = p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
  const gas = gasNote(chain);
  return [
    `Read ${name}'s official docs and announcements first, and confirm it runs a points program or has hinted at a token; only trust links from its own site and verified accounts, never a link from a random reply.`,
    `Set up a wallet on ${chain} and bridge $100–$500 you can afford to leave untouched for weeks; on ${chain} a transaction costs ${gas}, so keep a little extra aside for gas.`,
    coreAction(p),
    `Repeat the core action at least once a week and try a second feature, for example a different pool or market, so your history shows steady use instead of a single deposit.`,
    `Join ${name}'s Discord and follow its official account, complete any listed quests or tasks, and keep screenshots of your positions as proof of what you did.`,
    `Watch for a token or snapshot announcement; if one comes, read the claim rules before moving funds. Never deposit more than you can lose — smart-contract risk is real, and a farm is not a yield promise.`,
  ];
}
