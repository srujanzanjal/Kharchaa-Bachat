"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** Primary message shown to the user */
  message?: string;
  /** Supporting detail text */
  detail?: string;
  /** Callback for the retry button */
  onRetry?: () => void;
  className?: string;
}

/**
 * Error/unavailable state — used when data cannot be loaded.
 *
 * Designed to handle database unavailable, network failure, and
 * similar scenarios without leaking implementation details
 * (e.g. never says "Supabase is paused").
 */
export function ErrorState({
  message = "We can\u2019t reach your data right now",
  detail,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center py-16 text-center", className)}>
      <p className="type-body text-text-secondary">{message}</p>
      {detail && (
        <p className="type-body-sm text-text-tertiary mt-1">{detail}</p>
      )}
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          className="mt-5"
        >
          Try again
        </Button>
      )}
    </div>
  );
}
