import { cn } from "@/lib/utils";

interface DividerProps {
  /** Optional label rendered in the middle of the rule */
  label?: string;
  className?: string;
}

function Divider({ label, className }: DividerProps) {
  if (label) {
    return (
      <div className={cn("flex items-center gap-3", className)} role="separator">
        <span className="h-px flex-1 bg-border" />
        <span className="type-caption text-text-tertiary">{label}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <hr
      className={cn("h-px border-0 bg-border", className)}
    />
  );
}

export { Divider };
