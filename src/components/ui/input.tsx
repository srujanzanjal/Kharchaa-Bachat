import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Content to render before the input (e.g. "₹") */
  prefix?: string;
  /** Error message — sets error styling when truthy */
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, prefix, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border bg-bg-tertiary px-3",
            "transition-colors duration-150",
            "focus-within:border-accent focus-within:bg-bg-secondary",
            error ? "border-destructive" : "border-border",
            className
          )}
        >
          {prefix && (
            <span className="text-text-tertiary select-none text-[0.9375rem] font-medium">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              "h-11 w-full bg-transparent text-text-primary placeholder:text-text-tertiary",
              "text-base md:text-[0.9375rem] border-none outline-none ring-0 shadow-none",
              "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
              "min-h-[44px]" // touch target
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="type-caption text-destructive normal-case tracking-normal">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input, type InputProps };
