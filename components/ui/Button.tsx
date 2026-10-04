import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * - `primary`: safety orange with dark text. The one main action on a screen.
 * - `default`: outlined. Most actions.
 * - `ink`: solid off-black. A strong secondary when outline is too quiet.
 * - `ghost`: text only. Tertiary actions, toolbar icons.
 * - `danger`: outlined, orange-ink text. Destructive actions.
 * `accent` is kept as an alias of `primary`.
 */
export type ButtonVariant =
  | "default"
  | "primary"
  | "accent"
  | "ink"
  | "ghost"
  | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    "bg-transparent border-[color-mix(in_oklab,var(--ink)_28%,transparent)] text-[var(--ink)] hover:border-[var(--ink)] hover:bg-[var(--hover)]",
  primary:
    "bg-[var(--accent)] border-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]",
  accent:
    "bg-[var(--accent)] border-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]",
  ink: "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-2)] hover:border-[var(--ink-2)]",
  ghost:
    "bg-transparent border-transparent text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--hover)]",
  danger:
    "bg-transparent border-[color-mix(in_oklab,var(--accent-ink)_45%,transparent)] text-[var(--accent-ink)] hover:border-[var(--accent-ink)] hover:bg-[var(--accent-wash)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-[34px] px-3 text-[13.5px] gap-1.5 [&_svg]:size-[15px]",
  md: "h-10 px-4 text-[14.5px] gap-2 [&_svg]:size-[17px]",
  lg: "h-12 px-6 text-[16px] gap-2.5 [&_svg]:size-[18px]",
  /** Square icon-only buttons; give them an aria-label. */
  icon: "size-10 p-0 [&_svg]:size-[19px]",
  "icon-sm": "size-[34px] p-0 [&_svg]:size-[17px]",
};

/**
 * The button's class string, exposed so non-button elements that should look
 * like a button (e.g. an `<a>`) can share the exact same styles without drift.
 */
export function buttonClasses({
  variant = "default",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    "inline-flex items-center justify-center shrink-0 whitespace-nowrap",
    "border rounded-[var(--r)] cursor-pointer select-none no-underline",
    "font-[620] [font-stretch:104%] tracking-[-0.005em] leading-none",
    "transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease)]",
    "active:scale-[0.98]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
    variantStyles[variant],
    sizeStyles[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonClasses({ variant, size, className })}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
