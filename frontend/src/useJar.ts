import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { TipJarBcs } from "./tipJar";

/** Reads a shared TipJar straight from the chain and decodes its fields. */
export function useJar(jarId: string | null) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ["jar", jarId],
    enabled: !!jarId,
    queryFn: async () => {
      const { object } = await client.getObject({
        objectId: jarId!,
        include: { content: true },
      });
      return TipJarBcs.parse(object.content);
    },
  });
}
