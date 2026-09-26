import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary";

const variants: Record<Variant, string> = {
  primary:
    "bg-linear-to-r from-sui via-violet to-magenta text-white shadow-[0_0_18px_rgb(160_80_255/0.35)] hover:opacity-90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
