import { bcs } from "@mysten/sui/bcs";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { normalizeStructTag } from "@mysten/sui/utils";

// Published from move/tip_jar (see ../../README.md).
// The ORIGINAL id names the types that existed in the first version (TipJar,
// OwnerCap, their events). Calls always go to the LATEST version, and types
// added by the upgrade (TokenKey, Token* events) carry the latest id.
export const PACKAGE_ID =
  "0x7032353131b3710055c4145beb5f6e5cb55e60903a25655fe181441f0cf8e7bb";
export const LATEST_PACKAGE_ID =
  "0xd1e81332173d6723c46e8505c55399e9d6bd679aa1fcef0aaaa7c79cb2eda1c5";
export const OWNER_CAP_TYPE = `${PACKAGE_ID}::tip_jar::OwnerCap`;

const call = (fn: string) => `${LATEST_PACKAGE_ID}::tip_jar::${fn}` as const;

// === Tokens ===

export type Symbol = "SUI" | "USDC";
export type Token = { symbol: Symbol; type: string; decimals: number; presets: string[] };

export const SUI: Token = { symbol: "SUI", type: "0x2::sui::SUI", decimals: 9, presets: ["0.1", "0.5", "1"] };
// Circle's USDC on Sui testnet.
export const USDC: Token = {
  symbol: "USDC",
  type: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
  decimals: 6,
  presets: ["1", "5", "10"],
};
export const TOKENS: Token[] = [SUI, USDC];

/** Matches any spelling of a coin type (short/long address, with or without 0x). */
export function tokenForType(coinType: string): Token | undefined {
  const normalized = normalizeStructTag(coinType.startsWith("0x") ? coinType : `0x${coinType}`);
  return TOKENS.find((t) => normalizeStructTag(t.type) === normalized);
}

// === On-chain layouts ===

// BCS layouts mirror the Move structs field-for-field, in the same order.
// A UID/ID is 32 bytes (an address) and Balance<T> is a struct holding one u64.
export const TipJarBcs = bcs.struct("TipJar", {
  id: bcs.Address,
  funds: bcs.u64(),
  total_tipped: bcs.u64(),
  tip_count: bcs.u64(),
  total_direct: bcs.u64(),
});

export const OwnerCapBcs = bcs.struct("OwnerCap", {
  id: bcs.Address,
  jar_id: bcs.Address,
});

/** A non-SUI coin's vault, stored on the jar as a dynamic field. */
export const TokenVaultBcs = bcs.struct("TokenVault", {
  funds: bcs.u64(),
  total_tipped: bcs.u64(),
  tip_count: bcs.u64(),
  total_direct: bcs.u64(),
});

export const tokenKeyType = (token: Token) => `${LATEST_PACKAGE_ID}::tip_jar::TokenKey<${token.type}>`;

/**
 * Coins sent straight to a jar's ID from a wallet's Send screen. They wait at
 * the jar's address until the owner collects them: either in the jar's address
 * balance, or as whole Coin objects (depends on the sender's wallet).
 */
export type PendingDeposits = {
  addressBalance: bigint;
  coinIds: string[];
  total: bigint;
};

export type PerToken<T> = Record<Symbol, T>;

// === Transaction builders (one PTB per user action) ===

/** create() returns an OwnerCap with no `drop`, so the PTB must transfer it. */
export function createJarTx(owner: string): Transaction {
  const tx = new Transaction();
  const [cap] = tx.moveCall({ target: call("create") });
  tx.transferObjects([cap], owner);
  return tx;
}

/**
 * SUI: split the exact tip off the gas coin. Other coins: coinWithBalance
 * gathers exactly `amount` from the tipper's coins of that type.
 */
export function tipTx(jarId: string, token: Token, amount: bigint): Transaction {
  const tx = new Transaction();
  if (token.symbol === "SUI") {
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.moveCall({ target: call("tip"), arguments: [tx.object(jarId), payment] });
  } else {
    const payment = tx.add(coinWithBalance({ type: token.type, balance: amount }));
    tx.moveCall({ target: call("tip_token"), typeArguments: [token.type], arguments: [tx.object(jarId), payment] });
  }
  return tx;
}

/** Adds the calls that pull every pending direct deposit (all tokens) into the jar. */
function addCollectCalls(tx: Transaction, jarId: string, capId: string, pending: PerToken<PendingDeposits>) {
  for (const token of TOKENS) {
    const p = pending[token.symbol];
    const isSui = token.symbol === "SUI";
    const typeArguments = isSui ? [] : [token.type];
    if (p.addressBalance > 0n) {
      tx.moveCall({
        target: call(isSui ? "collect_address_deposits" : "collect_token_address_deposits"),
        typeArguments,
        arguments: [tx.object(jarId), tx.object(capId), tx.pure.u64(p.addressBalance)],
      });
    }
    for (const coinId of p.coinIds) {
      // The SDK sees the Move parameter is Receiving<Coin<T>> and passes a receiving ref.
      tx.moveCall({
        target: call(isSui ? "collect_coin_deposit" : "collect_token_coin_deposit"),
        typeArguments,
        arguments: [tx.object(jarId), tx.object(capId), tx.object(coinId)],
      });
    }
  }
}

export function collectDepositsTx(jarId: string, capId: string, pending: PerToken<PendingDeposits>): Transaction {
  const tx = new Transaction();
  addCollectCalls(tx, jarId, capId, pending);
  return tx;
}

/** Collect direct deposits, then withdraw every token the jar holds, in one signature. */
export function withdrawAllTx(
  jarId: string,
  capId: string,
  owner: string,
  pending: PerToken<PendingDeposits>,
  inJar: PerToken<bigint>,
): Transaction {
  const tx = new Transaction();
  addCollectCalls(tx, jarId, capId, pending);
  const payouts = TOKENS.filter((t) => inJar[t.symbol] + pending[t.symbol].total > 0n).map((token) =>
    token.symbol === "SUI"
      ? tx.moveCall({ target: call("withdraw_all"), arguments: [tx.object(jarId), tx.object(capId)] })
      : tx.moveCall({
          target: call("withdraw_all_token"),
          typeArguments: [token.type],
          arguments: [tx.object(jarId), tx.object(capId)],
        }),
  );
  if (payouts.length > 0) tx.transferObjects(payouts, owner);
  return tx;
}

// === Display helpers ===

export function tipCount(count: string): string {
  return count === "1" ? "1 app tip" : `${count} app tips`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// === Amount helpers (never use floating point for money) ===

export function formatAmount(value: bigint | string, token: Token): string {
  const v = BigInt(value);
  const unit = 10n ** BigInt(token.decimals);
  const frac = (v % unit).toString().padStart(token.decimals, "0").replace(/0+$/, "");
  return frac ? `${v / unit}.${frac}` : (v / unit).toString();
}

/** "0.1" -> 100000000n for SUI. Returns null for anything that isn't a positive amount. */
export function parseAmount(input: string, token: Token): bigint | null {
  const match = input.trim().match(new RegExp(`^(\\d+)(?:\\.(\\d{1,${token.decimals}}))?$`));
  if (!match) return null;
  const value = BigInt(match[1]) * 10n ** BigInt(token.decimals) + BigInt((match[2] ?? "").padEnd(token.decimals, "0"));
  return value > 0n ? value : null;
}

export const formatSui = (mist: bigint | string) => formatAmount(mist, SUI);
