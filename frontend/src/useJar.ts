import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { type PerToken, TipJarBcs, tokenKeyType, TokenVaultBcs, USDC } from "./tipJar";

export type JarTotals = { inJar: bigint; totalTipped: bigint; tipCount: bigint; totalDirect: bigint };

const EMPTY: JarTotals = { inJar: 0n, totalTipped: 0n, tipCount: 0n, totalDirect: 0n };

/**
 * Reads a shared TipJar straight from the chain: SUI lives in the jar's own
 * fields, USDC in a dynamic field (TokenKey<USDC> -> TokenVault<USDC>) that
 * only exists once the jar has received USDC.
 */
export function useJar(jarId: string | null) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ["jar", jarId],
    enabled: !!jarId,
    queryFn: async (): Promise<PerToken<JarTotals>> => {
      const [{ object }, usdc] = await Promise.all([
        client.getObject({ objectId: jarId!, include: { content: true } }),
        client
          .getDynamicField({
            parentId: jarId!,
            // TokenKey<T> has no fields; Move encodes an empty struct as one `false` byte.
            name: { type: tokenKeyType(USDC), bcs: new Uint8Array([0]) },
          })
          .then(({ dynamicField }) => TokenVaultBcs.parse(dynamicField.value.bcs))
          .catch(() => null),
      ]);
      const sui = TipJarBcs.parse(object.content);
      return {
        SUI: {
          inJar: BigInt(sui.funds),
          totalTipped: BigInt(sui.total_tipped),
          tipCount: BigInt(sui.tip_count),
          totalDirect: BigInt(sui.total_direct),
        },
        USDC: usdc
          ? {
              inJar: BigInt(usdc.funds),
              totalTipped: BigInt(usdc.total_tipped),
              tipCount: BigInt(usdc.tip_count),
              totalDirect: BigInt(usdc.total_direct),
            }
          : EMPTY,
      };
    },
  });
}
