import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import type { PendingDeposits } from "./tipJar";

/** SUI waiting at the jar's ID from direct wallet sends, not yet collected. */
export function usePendingDeposits(jarId: string | null) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ["pending", jarId],
    enabled: !!jarId,
    queryFn: async (): Promise<PendingDeposits> => {
      const [{ balance }, coins] = await Promise.all([
        client.getBalance({ owner: jarId! }),
        client.listCoins({ owner: jarId! }),
      ]);
      const addressBalance = BigInt(balance.addressBalance);
      const coinTotal = coins.objects.reduce((sum, c) => sum + BigInt(c.balance), 0n);
      return {
        addressBalance,
        coinIds: coins.objects.map((c) => c.objectId),
        total: addressBalance + coinTotal,
      };
    },
  });
}
