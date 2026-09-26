import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { type PendingDeposits, type PerToken, SUI, type Token, USDC } from "./tipJar";

/** Coins waiting at the jar's ID from direct wallet sends, not yet collected, per token. */
export function usePendingDeposits(jarId: string | null) {
  const client = useCurrentClient();

  async function forToken(token: Token): Promise<PendingDeposits> {
    const [{ balance }, coins] = await Promise.all([
      client.getBalance({ owner: jarId!, coinType: token.type }),
      client.listCoins({ owner: jarId!, coinType: token.type }),
    ]);
    const addressBalance = BigInt(balance.addressBalance);
    const coinTotal = coins.objects.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    return { addressBalance, coinIds: coins.objects.map((c) => c.objectId), total: addressBalance + coinTotal };
  }

  return useQuery({
    queryKey: ["pending", jarId],
    enabled: !!jarId,
    queryFn: async (): Promise<PerToken<PendingDeposits>> => {
      const [sui, usdc] = await Promise.all([forToken(SUI), forToken(USDC)]);
      return { SUI: sui, USDC: usdc };
    },
  });
}
