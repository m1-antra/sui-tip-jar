import { Transaction } from '@mysten/sui/transactions';

export const MIST_PER_SUI = 1_000_000_000n;

const target = (packageId: string, fn: string) =>
  `${packageId}::tip_jar::${fn}` as const;

/** create() returns an OwnerCap with no `drop`, so the PTB must transfer it. */
export function createJarTx(packageId: string, owner: string): Transaction {
  const tx = new Transaction();
  const [cap] = tx.moveCall({ target: target(packageId, 'create') });
  tx.transferObjects([cap], owner);
  return tx;
}

/** Split the exact tip off the gas coin, then hand that coin to the contract. */
export function tipTx(packageId: string, jarId: string, amountMist: bigint): Transaction {
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  tx.moveCall({
    target: target(packageId, 'tip'),
    arguments: [tx.object(jarId), payment],
  });
  return tx;
}

/** Only succeeds if the signer owns `capId` and it matches `jarId`. */
export function withdrawTx(
  packageId: string,
  jarId: string,
  capId: string,
  amountMist: bigint,
  recipient: string,
): Transaction {
  const tx = new Transaction();
  const [payout] = tx.moveCall({
    target: target(packageId, 'withdraw'),
    arguments: [tx.object(jarId), tx.object(capId), tx.pure.u64(amountMist)],
  });
  tx.transferObjects([payout], recipient);
  return tx;
}
