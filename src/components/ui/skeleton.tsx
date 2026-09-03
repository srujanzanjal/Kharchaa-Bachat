import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse-subtle rounded-md bg-bg-tertiary",
        className
      )}
    />
  );
}

export { Skeleton };
