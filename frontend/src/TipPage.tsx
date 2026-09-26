import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Heart, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { formatSui, parseSui, tipSummary, tipTx } from "./tipJar";
import { useJar } from "./useJar";
import { useTransact } from "./useTransact";

const PRESETS = ["0.1", "0.5", "1"];

/** Supporter view, reached through a shared ?jar=<id> link. */
export function TipPage({ jarId }: { jarId: string }) {
  const account = useCurrentAccount();
  const jar = useJar(jarId);
  const { run, pending, error } = useTransact();
  const [amount, setAmount] = useState("0.1");
  const [thanked, setThanked] = useState(false);
  const mist = parseSui(amount);

  async function tip() {
    if (!mist) return;
    setThanked(await run(tipTx(jarId, mist)));
  }

  if (jar.error) {
    return <p className="text-destructive-foreground">Could not load this jar: {jar.error.message}</p>;
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-sui" /> Send a tip
        </CardTitle>
        <CardDescription className="font-mono text-xs break-all">{jarId}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-muted-foreground">
          {jar.data ? `${tipSummary(jar.data)} so far` : "Loading jar..."}
        </p>

        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <Button key={p} variant="secondary" onClick={() => setAmount(p)} className={amount === p ? "ring-2 ring-sui" : ""}>
              {p} SUI
            </Button>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Amount (SUI)</span>
          <input
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setThanked(false); }}
            inputMode="decimal"
            className="w-full rounded-md border bg-transparent px-3 py-2"
          />
        </label>

        {account ? (
          <Button className="w-full" disabled={!mist || pending} onClick={tip}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mist ? `Tip ${formatSui(mist)} SUI` : "Enter an amount"}
          </Button>
        ) : (
          <p className="text-center text-muted-foreground">Connect a wallet to send a tip.</p>
        )}

        {thanked && <p className="text-center text-green-500">Thank you! Your tip landed on-chain.</p>}
        {error && <p className="text-sm text-destructive-foreground">{error}</p>}
      </CardContent>
    </Card>
  );
}
