import { useQuery } from "@tanstack/react-query";
import { type EventRecord, fetchDirectDeposits, fetchEvents } from "./graphql";
import { LATEST_PACKAGE_ID, PACKAGE_ID, SUI, type Token, tokenForType } from "./tipJar";

export type ActivityKind = "tip" | "direct" | "collected" | "withdrawn";

export type Activity = {
  kind: ActivityKind;
  timestamp: string;
  digest: string;
  amount: bigint;
  token: Token;
  /** Who sent or triggered it. */
  from: string;
};

type JarEvent = { jar_id: string; amount: string; coin_type?: string; tipper?: string; by?: string };

/**
 * One timeline for a jar, merged from on-chain sources: app tips and owner
 * actions come from our contract's events (SUI ones from the original package,
 * token ones from the upgrade); direct wallet sends come from the chain's
 * transaction history for the jar's address.
 */
export function useJarActivity(jarId: string | null) {
  return useQuery({
    queryKey: ["activity", jarId],
    enabled: !!jarId,
    queryFn: async (): Promise<Activity[]> => {
      const sources: [ActivityKind, string, string][] = [
        ["tip", PACKAGE_ID, "TipReceived"],
        ["collected", PACKAGE_ID, "DirectDepositCollected"],
        ["withdrawn", PACKAGE_ID, "Withdrawn"],
        ["tip", LATEST_PACKAGE_ID, "TokenTipReceived"],
        ["collected", LATEST_PACKAGE_ID, "TokenDepositCollected"],
        ["withdrawn", LATEST_PACKAGE_ID, "TokenWithdrawn"],
      ];
      const [direct, ...eventLists] = await Promise.all([
        fetchDirectDeposits(jarId!),
        ...sources.map(([, pkg, name]) => fetchEvents<JarEvent>(pkg, name)),
      ]);

      const fromEvents = eventLists.flatMap((events: EventRecord<JarEvent>[], i) =>
        events
          .filter((e) => e.json.jar_id === jarId)
          .flatMap((e) => {
            const token = e.json.coin_type ? tokenForType(e.json.coin_type) : SUI;
            return token
              ? [{
                  kind: sources[i][0],
                  timestamp: e.timestamp,
                  digest: e.digest,
                  amount: BigInt(e.json.amount),
                  token,
                  from: e.json.tipper ?? e.json.by ?? "unknown",
                }]
              : [];
          }),
      );
      const items: Activity[] = [...fromEvents, ...direct.map((d) => ({ kind: "direct" as const, ...d }))];
      return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20);
    },
  });
}
