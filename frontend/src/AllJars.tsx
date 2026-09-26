import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { formatSui, PACKAGE_ID, tipCount, TipJarBcs } from "./tipJar";

const GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

/**
 * Every jar announces itself with a JarCreated event, so we can find all jars
 * without a backend: ask GraphQL for those events, then read each jar object.
 */
async function fetchJarIds(): Promise<string[]> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query($type: String!) {
        events(filter: { type: $type }, first: 50) { nodes { contents { json } } }
      }`,
      variables: { type: `${PACKAGE_ID}::tip_jar::JarCreated` },
    }),
  });
  const body = await res.json();
  return body.data.events.nodes.map((n: { contents: { json: { jar_id: string } } }) => n.contents.json.jar_id);
}

export function AllJars() {
  const client = useCurrentClient();

  const jars = useQuery({
    queryKey: ["allJars"],
    queryFn: async () => {
      const ids = await fetchJarIds();
      if (ids.length === 0) return [];
      const { objects } = await client.getObjects({ objectIds: ids, include: { content: true } });
      return objects.flatMap((o) => (o instanceof Error ? [] : [TipJarBcs.parse(o.content)]));
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

  const held = jars.data.reduce((sum, j) => sum + BigInt(j.funds), 0n);
  const tipped = jars.data.reduce((sum, j) => sum + BigInt(j.total_tipped), 0n);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Jars" value={jars.data.length.toString()} />
        <Stat label="Held right now" value={`${formatSui(held)} SUI`} />
        <Stat label="Tipped all-time" value={`${formatSui(tipped)} SUI`} />
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
              <span className="shrink-0 text-sm">
                {formatSui(j.funds)} SUI held · {tipCount(j.tip_count)}
              </span>
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
