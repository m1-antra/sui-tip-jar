import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";

// Published from move/tip_jar (see ../../README.md).
export const PACKAGE_ID =
  "0x8c14352695f80e3406e96189d8b722907e6535b67463c3d01031b1f1add88562";
export const OWNER_CAP_TYPE = `${PACKAGE_ID}::tip_jar::OwnerCap`;

export const MIST_PER_SUI = 1_000_000_000n;

// BCS layouts mirror the Move structs field-for-field, in the same order.
// A UID/ID is 32 bytes (an address) and Balance<SUI> is a struct holding one u64.
export const TipJarBcs = bcs.struct("TipJar", {
  id: bcs.Address,
  funds: bcs.u64(),
  total_tipped: bcs.u64(),
  tip_count: bcs.u64(),
});

export const OwnerCapBcs = bcs.struct("OwnerCap", {
  id: bcs.Address,
  jar_id: bcs.Address,
});

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

/** withdraw_all() returns a Coin, which the PTB sends to the owner. */
export function withdrawAllTx(jarId: string, capId: string, owner: string): Transaction {
  const tx = new Transaction();
  const [payout] = tx.moveCall({
    target: `${PACKAGE_ID}::tip_jar::withdraw_all`,
    arguments: [tx.object(jarId), tx.object(capId)],
  });
  tx.transferObjects([payout], owner);
  return tx;
}

export function tipSummary(jar: { tip_count: string; total_tipped: string }): string {
  const tips = jar.tip_count === "1" ? "1 tip" : `${jar.tip_count} tips`;
  return `${tips} · ${formatSui(jar.total_tipped)} SUI received`;
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
