import { useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import type { Transaction } from "@mysten/sui/transactions";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Wallet signs -> network executes -> we wait for it to be indexed -> refetch.
 * Every button that changes on-chain state goes through this.
 */
export function useTransact() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(tx: Transaction): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed");
      }
      await client.waitForTransaction({ result });
      await queryClient.invalidateQueries();
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        /insufficient SUI balance/i.test(message)
          ? "This wallet has no testnet SUI to pay gas. Get some from https://faucet.sui.io and try again."
          : message,
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  return { run, pending, error };
}
