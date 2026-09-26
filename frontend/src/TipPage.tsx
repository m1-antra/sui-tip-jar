import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Check, Copy, Heart, Loader2, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { JarActivity } from "./JarActivity";
import { formatSui, parseSui, tipSummary, tipTx } from "./tipJar";
import { useJar } from "./useJar";
import { usePendingDeposits } from "./usePendingDeposits";
import { useTransact } from "./useTransact";

const PRESETS = ["0.1", "0.5", "1"];

/** Supporter view, reached through a shared ?jar=<id> link. */
export function TipPage({ jarId }: { jarId: string }) {
  const jar = useJar(jarId);
  const pending = usePendingDeposits(jarId);

  if (jar.error) {
    return <p className="text-destructive-foreground">Could not load this jar: {jar.error.message}</p>;
  }

  const held = jar.data && pending.data ? BigInt(jar.data.funds) + pending.data.total : null;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <h2 className="flex items-center justify-center gap-2 text-2xl font-semibold">
          <Heart className="h-6 w-6 text-sui" /> Send a tip
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {held !== null ? `${formatSui(held)} SUI in the jar now` : "Loading jar..."}
          {jar.data && <span className="block text-xs">{tipSummary(jar.data)}</span>}
        </p>
      </div>

      <AnyWalletCard jarId={jarId} />
      <InAppTipCard jarId={jarId} />

      <Card>
        <CardHeader>
          <CardTitle>Jar activity</CardTitle>
          <CardDescription>Every deposit and withdrawal, read live from Sui.</CardDescription>
        </CardHeader>
        <CardContent>
          <JarActivity jarId={jarId} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Primary path: scan or paste the jar's address into any wallet's Send screen. */
function AnyWalletCard({ jarId }: { jarId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(jarId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-sui" /> Tip from any wallet
        </CardTitle>
        <CardDescription>No app needed: send SUI to this jar's address like any other payment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="mx-auto w-fit rounded-lg bg-white p-3">
          <QRCodeSVG value={jarId} size={200} />
        </div>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded-md border bg-muted/50 px-3 py-2 text-xs break-all">{jarId}</code>
          <Button variant="secondary" onClick={copy} aria-label="Copy jar address">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Open your Sui wallet and choose <strong>Send</strong>.</li>
          <li>Scan the QR code, or paste the address above.</li>
          <li>Enter an amount of SUI.</li>
          <li>
            <strong className="text-foreground">Always scan or copy, never type or photo-read the address.</strong> Sui
            addresses have no typo check: one wrong character, even in the middle, sends SUI to an address nobody owns.
          </li>
        </ol>
        <p className="rounded-md border border-sui/40 bg-sui/10 px-3 py-2 text-xs">
          This jar is on <strong>Sui Testnet</strong>. Switch your wallet to Testnet and send <strong>SUI only</strong>.
        </p>
      </CardContent>
    </Card>
  );
}

/** Secondary path: for people who opened the link in a wallet's browser. */
function InAppTipCard({ jarId }: { jarId: string }) {
  const account = useCurrentAccount();
  const { run, pending, error } = useTransact();
  const [amount, setAmount] = useState("0.1");
  const [thanked, setThanked] = useState(false);
  const mist = parseSui(amount);

  async function tip() {
    if (!mist) return;
    setThanked(await run(tipTx(jarId, mist)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Or tip right here</CardTitle>
        <CardDescription>Connect a wallet in this browser and tip in one click.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <p className="text-center text-sm text-muted-foreground">Use Connect Wallet at the top to tip from this page.</p>
        )}

        {thanked && <p className="text-center text-green-500">Thank you! Your tip landed on-chain.</p>}
        {error && <p className="text-sm text-destructive-foreground">{error}</p>}
      </CardContent>
    </Card>
  );
}
