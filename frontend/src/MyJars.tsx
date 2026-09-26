import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, Check, Copy, ExternalLink, History, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { JarActivity } from "./JarActivity";
import {
  collectDepositsTx,
  createJarTx,
  formatSui,
  OWNER_CAP_TYPE,
  OwnerCapBcs,
  tipSummary,
  withdrawAllTx,
} from "./tipJar";
import { useJar } from "./useJar";
import { usePendingDeposits } from "./usePendingDeposits";
import { useTransact } from "./useTransact";

export function tipLink(jarId: string) {
  return `${window.location.origin}${window.location.pathname}?jar=${jarId}`;
}

/** Owner view: every OwnerCap in the wallet is a jar you control. */
export function MyJars() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const { run, pending, error } = useTransact();

  const caps = useQuery({
    queryKey: ["ownerCaps", account?.address],
    enabled: !!account,
    queryFn: async () => {
      const { objects } = await client.listOwnedObjects({
        owner: account!.address,
        type: OWNER_CAP_TYPE,
        include: { content: true },
      });
      return objects.map((o) => ({ capId: o.objectId, jarId: OwnerCapBcs.parse(o.content).jar_id }));
    },
  });

  if (!account) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Connect a wallet to create a tip jar or see the ones you own.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">My tip jars</h2>
        <Button disabled={pending} onClick={() => run(createJarTx(account.address))}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create a jar
        </Button>
      </div>
      {error && <p className="text-sm text-destructive-foreground">{error}</p>}

      {caps.isPending ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your jars...
        </p>
      ) : caps.error ? (
        <p className="text-destructive-foreground">{caps.error.message}</p>
      ) : caps.data.length === 0 ? (
        <p className="text-muted-foreground">No jars yet. Create one to get a shareable tip link.</p>
      ) : (
        caps.data.map((c) => <JarCard key={c.capId} {...c} owner={account.address} />)
      )}
    </div>
  );
}

function JarCard({ jarId, capId, owner }: { jarId: string; capId: string; owner: string }) {
  const jar = useJar(jarId);
  const deposits = usePendingDeposits(jarId);
  const { run, pending, error } = useTransact();
  const [copied, setCopied] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const funds = jar.data ? BigInt(jar.data.funds) : 0n;
  const waiting = deposits.data?.total ?? 0n;
  const waitingCount = deposits.data ? deposits.data.coinIds.length + (deposits.data.addressBalance > 0n ? 1 : 0) : 0;

  async function copy() {
    await navigator.clipboard.writeText(tipLink(jarId));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-sm break-all">{jarId}</CardTitle>
        <CardDescription>
          {jar.data ? `${tipSummary(jar.data)} all-time` : "Loading..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-semibold">{formatSui(funds + waiting)} SUI</p>
          {waiting > 0n && (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatSui(funds)} in the jar · <span className="text-sui">{formatSui(waiting)} waiting to collect</span> from
              direct wallet sends ({waitingCount} {waitingCount === 1 ? "deposit" : "deposits"})
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy tip link"}
          </Button>
          <a href={tipLink(jarId)}>
            <Button variant="secondary">
              <ExternalLink className="h-4 w-4" /> Open tip page
            </Button>
          </a>
          {deposits.data && waiting > 0n && (
            <Button variant="secondary" disabled={pending} onClick={() => run(collectDepositsTx(jarId, capId, deposits.data))}>
              <ArrowDownToLine className="h-4 w-4" /> Collect deposits
            </Button>
          )}
          <Button
            disabled={pending || !deposits.data || funds + waiting === 0n}
            onClick={() => deposits.data && run(withdrawAllTx(jarId, capId, owner, deposits.data))}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Withdraw all
          </Button>
          <Button variant="secondary" onClick={() => setShowActivity((s) => !s)}>
            <History className="h-4 w-4" /> {showActivity ? "Hide activity" : "Activity"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive-foreground">{error}</p>}
        {showActivity && <JarActivity jarId={jarId} />}
      </CardContent>
    </Card>
  );
}
