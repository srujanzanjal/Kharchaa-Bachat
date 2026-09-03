import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent/90 active:bg-accent/80",
  secondary:
    "border border-border text-text-primary hover:border-border-active hover:bg-bg-tertiary active:bg-bg-secondary",
  ghost:
    "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary active:bg-bg-secondary",
  destructive:
    "bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/25",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-[0.875rem]",
  lg: "h-12 px-6 text-[0.9375rem] font-medium",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
          "transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:pointer-events-none disabled:opacity-40",
          "select-none touch-manipulation",
          "min-h-[44px]", // touch target
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, type ButtonProps };
