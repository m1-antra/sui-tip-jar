import { ArrowDownToLine, ArrowUpFromLine, Heart, Loader2, Send } from "lucide-react";
import type { ReactNode } from "react";
import { formatSui, shortAddress } from "./tipJar";
import { type ActivityKind, useJarActivity } from "./useJarActivity";

const LABELS: Record<ActivityKind, { icon: ReactNode; text: string; sign: string }> = {
  tip: { icon: <Heart className="h-4 w-4 text-sui" />, text: "App tip from", sign: "+" },
  direct: { icon: <Send className="h-4 w-4 text-sui" />, text: "Direct deposit from", sign: "+" },
  collected: { icon: <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />, text: "Collected into jar by", sign: "" },
  withdrawn: { icon: <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" />, text: "Withdrawn by", sign: "−" },
};

/** Public record of everything that entered or left a jar, however it arrived. */
export function JarActivity({ jarId }: { jarId: string }) {
  const activity = useJarActivity(jarId);

  if (activity.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading activity...
      </p>
    );
  }
  if (activity.error) return <p className="text-sm text-destructive-foreground">{activity.error.message}</p>;
  if (activity.data.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;

  return (
    <ul className="space-y-2">
      {activity.data.map((a) => {
        const label = LABELS[a.kind];
        return (
          <li key={`${a.digest}-${a.kind}-${a.amount}`} className="flex items-center gap-3 rounded-md border bg-muted/50 px-3 py-2 text-sm">
            {label.icon}
            <span className="min-w-0 flex-1">
              {label.text}{" "}
              <a
                href={`https://suiscan.xyz/testnet/tx/${a.digest}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs underline decoration-dotted"
              >
                {shortAddress(a.from)}
              </a>
              <span className="block text-xs text-muted-foreground">{new Date(a.timestamp).toLocaleString()}</span>
            </span>
            <span className="shrink-0 font-medium">
              {label.sign}
              {formatSui(a.amount)} SUI
            </span>
          </li>
        );
      })}
    </ul>
  );
}
