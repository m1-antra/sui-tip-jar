import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { fetchJarIds } from "./graphql";
import { formatSui, TipJarBcs } from "./tipJar";

export function AllJars() {
  const client = useCurrentClient();

  const jars = useQuery({
    queryKey: ["allJars"],
    queryFn: async () => {
      const ids = await fetchJarIds();
      if (ids.length === 0) return [];
      const { objects } = await client.getObjects({ objectIds: ids, include: { content: true } });
      const parsed = objects.flatMap((o) => (o instanceof Error ? [] : [TipJarBcs.parse(o.content)]));
      // Direct wallet sends wait at each jar's address until the owner collects them.
      return Promise.all(
        parsed.map(async (j) => {
          const { balance } = await client.getBalance({ owner: j.id });
          return { ...j, waiting: BigInt(balance.balance) };
        }),
      );
    },
  });

  if (jars.isPending) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading every jar from the chain...
      </p>
    );
  }
  if (jars.error) return <p className="text-destructive-foreground">{jars.error.message}</p>;

  const held = jars.data.reduce((sum, j) => sum + BigInt(j.funds) + j.waiting, 0n);
  const waiting = jars.data.reduce((sum, j) => sum + j.waiting, 0n);
  const received = jars.data.reduce((sum, j) => sum + BigInt(j.total_tipped) + j.waiting, 0n);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Jars" value={jars.data.length.toString()} />
        <Stat
          label="Held right now"
          value={`${formatSui(held)} SUI`}
          note={waiting > 0n ? `incl. ${formatSui(waiting)} SUI not yet collected` : undefined}
        />
        <Stat label="Received all-time" value={`${formatSui(received)} SUI`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every jar, read live from Sui testnet</CardTitle>
          <CardDescription>
            Each jar is its own object with its own balance. Nothing is pooled, and this site never holds funds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {jars.data.map((j) => (
            <a
              key={j.id}
              href={`?jar=${j.id}`}
              className="flex items-center justify-between gap-4 rounded-md border bg-muted/50 p-3 hover:bg-muted"
            >
              <span className="font-mono text-xs break-all">{j.id}</span>
              <span className="shrink-0 text-right text-sm">
                {formatSui(BigInt(j.funds) + j.waiting)} SUI held
                {j.waiting > 0n && (
                  <span className="block text-xs text-sui">{formatSui(j.waiting)} waiting to collect</span>
                )}
              </span>
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardHeader>
    </Card>
  );
}
