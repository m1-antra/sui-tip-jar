import { useQuery } from "@tanstack/react-query";
import { type EventRecord, fetchDirectDeposits, fetchEvents } from "./graphql";

export type ActivityKind = "tip" | "direct" | "collected" | "withdrawn";

export type Activity = {
  kind: ActivityKind;
  timestamp: string;
  digest: string;
  amount: bigint;
  /** Who sent or triggered it. */
  from: string;
};

type JarEvent = { jar_id: string; amount: string };

/**
 * One timeline for a jar, merged from four on-chain sources:
 * app tips and owner actions come from our contract's events; direct wallet
 * sends come from the chain's transaction history for the jar's address.
 */
export function useJarActivity(jarId: string | null) {
  return useQuery({
    queryKey: ["activity", jarId],
    enabled: !!jarId,
    queryFn: async (): Promise<Activity[]> => {
      const [tips, direct, collected, withdrawn] = await Promise.all([
        fetchEvents<JarEvent & { tipper: string }>("TipReceived"),
        fetchDirectDeposits(jarId!),
        fetchEvents<JarEvent & { by: string }>("DirectDepositCollected"),
        fetchEvents<JarEvent & { by: string }>("Withdrawn"),
      ]);
      const mine = <T extends JarEvent>(events: EventRecord<T>[]) => events.filter((e) => e.json.jar_id === jarId);

      const items: Activity[] = [
        ...mine(tips).map((e) => ({ kind: "tip" as const, timestamp: e.timestamp, digest: e.digest, amount: BigInt(e.json.amount), from: e.json.tipper })),
        ...direct.map((d) => ({ kind: "direct" as const, ...d })),
        ...mine(collected).map((e) => ({ kind: "collected" as const, timestamp: e.timestamp, digest: e.digest, amount: BigInt(e.json.amount), from: e.json.by })),
        ...mine(withdrawn).map((e) => ({ kind: "withdrawn" as const, timestamp: e.timestamp, digest: e.digest, amount: BigInt(e.json.amount), from: e.json.by })),
      ];
      return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20);
    },
  });
}
