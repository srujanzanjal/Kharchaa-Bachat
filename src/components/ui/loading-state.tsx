import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  /** Number of skeleton lines to show */
  lines?: number;
  className?: string;
}

/** Loading placeholder — used while waiting for data from an external source */
export function LoadingState({ lines = 3, className }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col gap-3 py-6", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4 rounded",
            i === 0 && "w-3/4",
            i === 1 && "w-1/2",
            i >= 2 && "w-2/3"
          )}
        />
      ))}
    </div>
  );
}
