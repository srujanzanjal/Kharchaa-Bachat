import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "positive" | "negative" | "accent";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  neutral: "bg-bg-tertiary text-text-secondary",
  positive: "bg-positive/10 text-positive",
  negative: "bg-destructive/10 text-destructive",
  accent: "bg-accent-muted text-accent",
};

function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5",
        "text-[0.6875rem] font-medium leading-tight",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export { Badge, type BadgeProps };
