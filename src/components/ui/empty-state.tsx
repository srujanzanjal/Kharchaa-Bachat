import { cn } from "@/lib/utils";

interface EmptyStateProps {
  message: string;
  detail?: string;
  className?: string;
}

/** Minimal empty state — used when a section has no data yet */
export function EmptyState({ message, detail, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center py-12 text-center", className)}>
      <p className="type-body text-text-secondary">{message}</p>
      {detail && (
        <p className="type-body-sm text-text-tertiary mt-1">{detail}</p>
      )}
    </div>
  );
}
