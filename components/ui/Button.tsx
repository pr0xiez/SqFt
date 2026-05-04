import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant =
  | "default"
  | "primary"
  | "accent"
  | "sage"
  | "gold"
  | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    "bg-[var(--surface)] border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface-2)] hover:border-[var(--ink-2)]",
  primary:
    "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-2)] hover:border-[var(--ink-2)]",
  accent:
    "bg-[var(--accent)] border-[var(--accent)] text-white hover:bg-[var(--accent-l)] hover:border-[var(--accent-l)]",
  sage: "bg-[var(--sage)] border-[var(--sage)] text-white hover:bg-[var(--sage-l)] hover:border-[var(--sage-l)]",
  gold: "bg-[var(--gold)] border-[var(--gold)] text-white hover:bg-[var(--gold-l)] hover:border-[var(--gold-l)]",
  ghost:
    "bg-transparent border-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3.5 py-2 text-[11px]",
  md: "px-5 py-2.5 text-[12px]",
  lg: "px-6 py-3 text-[13px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-1.5",
          "border cursor-pointer rounded-[6px]",
          "font-[var(--font-mono)] font-[500] tracking-[.02em]",
          "transition-[background,border-color,color] duration-[150ms]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "min-h-[36px]",
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
