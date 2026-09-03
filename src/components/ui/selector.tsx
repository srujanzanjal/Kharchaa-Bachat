"use client";

import { cn } from "@/lib/utils";

interface SelectorOption<T extends string> {
  value: T;
  label: string;
}

interface SelectorProps<T extends string> {
  options: SelectorOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible label for the selector group */
  ariaLabel?: string;
  className?: string;
}

function Selector<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = "Select an option",
  className,
}: SelectorProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex gap-1 rounded-lg border border-border bg-bg-secondary p-1",
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-md px-4 py-2 text-[0.8125rem] font-medium",
              "transition-all duration-200",
              "min-h-[40px] min-w-[44px]", // touch target
              "select-none touch-manipulation",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              selected
                ? "bg-bg-tertiary text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { Selector, type SelectorProps, type SelectorOption };
