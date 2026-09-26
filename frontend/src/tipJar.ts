import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";

// Published from move/tip_jar (see ../../README.md).
export const PACKAGE_ID =
  "0x7032353131b3710055c4145beb5f6e5cb55e60903a25655fe181441f0cf8e7bb";
export const OWNER_CAP_TYPE = `${PACKAGE_ID}::tip_jar::OwnerCap`;

export const MIST_PER_SUI = 1_000_000_000n;

// BCS layouts mirror the Move structs field-for-field, in the same order.
// A UID/ID is 32 bytes (an address) and Balance<SUI> is a struct holding one u64.
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

/**
 * SUI sent straight to a jar's ID from a wallet's Send screen. It waits at the
 * jar's address until the owner collects it: either in the jar's address
 * balance, or as whole Coin objects (depends on the sender's wallet).
 */
export type PendingDeposits = {
  addressBalance: bigint;
  coinIds: string[];
  total: bigint;
};

// === Transaction builders (one PTB per user action) ===

/** create() returns an OwnerCap with no `drop`, so the PTB must transfer it. */
export function createJarTx(owner: string): Transaction {
  const tx = new Transaction();
  const [cap] = tx.moveCall({ target: `${PACKAGE_ID}::tip_jar::create` });
  tx.transferObjects([cap], owner);
  return tx;
}

/** Split the exact tip off the gas coin, then hand that coin to the contract. */
export function tipTx(jarId: string, amountMist: bigint): Transaction {
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  tx.moveCall({
    target: `${PACKAGE_ID}::tip_jar::tip`,
    arguments: [tx.object(jarId), payment],
  });
  return tx;
}

/** Adds the calls that pull every pending direct deposit into the jar. */
function addCollectCalls(tx: Transaction, jarId: string, capId: string, pending: PendingDeposits) {
  if (pending.addressBalance > 0n) {
    tx.moveCall({
      target: `${PACKAGE_ID}::tip_jar::collect_address_deposits`,
      arguments: [tx.object(jarId), tx.object(capId), tx.pure.u64(pending.addressBalance)],
    });
  }
  for (const coinId of pending.coinIds) {
    // The SDK sees the Move parameter is Receiving<Coin<SUI>> and passes a receiving ref.
    tx.moveCall({
      target: `${PACKAGE_ID}::tip_jar::collect_coin_deposit`,
      arguments: [tx.object(jarId), tx.object(capId), tx.object(coinId)],
    });
  }
}

export function collectDepositsTx(jarId: string, capId: string, pending: PendingDeposits): Transaction {
  const tx = new Transaction();
  addCollectCalls(tx, jarId, capId, pending);
  return tx;
}

/** Collect direct deposits, then withdraw everything, in one signature. */
export function withdrawAllTx(
  jarId: string,
  capId: string,
  owner: string,
  pending: PendingDeposits,
): Transaction {
  const tx = new Transaction();
  addCollectCalls(tx, jarId, capId, pending);
  const [payout] = tx.moveCall({
    target: `${PACKAGE_ID}::tip_jar::withdraw_all`,
    arguments: [tx.object(jarId), tx.object(capId)],
  });
  tx.transferObjects([payout], owner);
  return tx;
}

// === Display helpers ===

export function tipCount(count: string): string {
  return count === "1" ? "1 app tip" : `${count} app tips`;
}

export function tipSummary(jar: { tip_count: string; total_tipped: string; total_direct: string }): string {
  const direct = BigInt(jar.total_direct) > 0n ? ` (${formatSui(jar.total_direct)} via direct deposits)` : "";
  return `${formatSui(jar.total_tipped)} SUI received${direct} · ${tipCount(jar.tip_count)}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// === SUI <-> MIST helpers (never use floating point for money) ===

export function formatSui(mist: bigint | string): string {
  const value = BigInt(mist);
  const whole = value / MIST_PER_SUI;
  const frac = (value % MIST_PER_SUI).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** "0.1" -> 100000000n. Returns null for anything that isn't a positive amount. */
export function parseSui(input: string): bigint | null {
  const match = input.trim().match(/^(\d+)(?:\.(\d{1,9}))?$/);
  if (!match) return null;
  const mist = BigInt(match[1]) * MIST_PER_SUI + BigInt((match[2] ?? "").padEnd(9, "0"));
  return mist > 0n ? mist : null;
}
