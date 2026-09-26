import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Check, Copy, Heart, Loader2, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { JarActivity } from "./JarActivity";
import { formatAmount, parseAmount, SUI, type Token, TOKENS, tipTx } from "./tipJar";
import { useJar } from "./useJar";
import { usePendingDeposits } from "./usePendingDeposits";
import { useTransact } from "./useTransact";

/** Supporter view, reached through a shared ?jar=<id> link. */
export function TipPage({ jarId }: { jarId: string }) {
  const jar = useJar(jarId);
  const pending = usePendingDeposits(jarId);

  if (jar.error) {
    return <p className="text-destructive-foreground">Could not load this jar: {jar.error.message}</p>;
  }

  const list = (pick: (t: Token) => bigint) =>
    TOKENS.map((t) => `${formatAmount(pick(t), t)} ${t.symbol}`).join(" · ");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <h2 className="flex items-center justify-center gap-2 text-2xl font-semibold">
          <Heart className="h-6 w-6 text-sui" /> Send a tip
        </h2>
        {jar.data && pending.data ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {list((t) => jar.data[t.symbol].inJar + pending.data[t.symbol].total)} in the jar now
            <span className="block text-xs">
              Received all-time: {list((t) => jar.data[t.symbol].totalTipped + pending.data[t.symbol].total)}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Loading jar...</p>
        )}
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
        <CardDescription>
          No app needed: send <strong>SUI or USDC</strong> to this jar's address like any other payment.
        </CardDescription>
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
          <li>Pick SUI or USDC and enter an amount.</li>
          <li>
            <strong className="text-foreground">Always scan or copy, never type or photo-read the address.</strong> Sui
            addresses have no typo check: one wrong character, even in the middle, sends funds to an address nobody owns.
          </li>
        </ol>
        <p className="rounded-md border border-sui/40 bg-sui/10 px-3 py-2 text-xs">
          This jar is on <strong>Sui Testnet</strong>. Switch your wallet to Testnet and send <strong>SUI or USDC only</strong>.
        </p>
      </CardContent>
    </Card>
  );
}

/** Secondary path: for people who opened the link in a wallet's browser. */
function InAppTipCard({ jarId }: { jarId: string }) {
  const account = useCurrentAccount();
  const { run, pending, error } = useTransact();
  const [token, setToken] = useState<Token>(SUI);
  const [amount, setAmount] = useState(SUI.presets[0]);
  const [thanked, setThanked] = useState(false);
  const value = parseAmount(amount, token);

  function pickToken(t: Token) {
    setToken(t);
    setAmount(t.presets[0]);
    setThanked(false);
  }

  async function tip() {
    if (!value) return;
    setThanked(await run(tipTx(jarId, token, value)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Or tip right here</CardTitle>
        <CardDescription>Connect a wallet in this browser and tip in one click.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="inline-flex rounded-md border p-1">
          {TOKENS.map((t) => (
            <button
              key={t.symbol}
              onClick={() => pickToken(t)}
              className={`rounded px-4 py-1 text-sm font-medium ${token.symbol === t.symbol ? "bg-linear-to-r from-sui via-violet to-magenta text-white" : "text-muted-foreground"}`}
            >
              {t.symbol}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {token.presets.map((p) => (
            <Button key={p} variant="secondary" onClick={() => setAmount(p)} className={amount === p ? "ring-2 ring-sui" : ""}>
              {p} {token.symbol}
            </Button>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Amount ({token.symbol})</span>
          <input
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setThanked(false); }}
            inputMode="decimal"
            className="w-full rounded-md border bg-transparent px-3 py-2"
          />
        </label>

        {account ? (
          <Button className="w-full" disabled={!value || pending} onClick={tip}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {value ? `Tip ${formatAmount(value, token)} ${token.symbol}` : "Enter an amount"}
          </Button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Use Connect Wallet at the top to tip from this page.</p>
        )}
        {token.symbol !== "SUI" && (
          <p className="text-center text-xs text-muted-foreground">
            {token.symbol} tips still need a little SUI in your wallet to pay the network fee.
          </p>
        )}

        {thanked && <p className="text-center text-green-500">Thank you! Your tip landed on-chain.</p>}
        {error && <p className="text-sm text-destructive-foreground">{error}</p>}
      </CardContent>
    </Card>
  );
}
