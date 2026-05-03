import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "default" | "primary" | "sage" | "gold" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    "bg-transparent border-oak text-oak hover:shadow-[3px_3px_0_var(--sand)] hover:-translate-x-px hover:-translate-y-px hover:bg-linen",
  primary:
    "bg-vermil border-vermil-d text-cream shadow-[3px_3px_0_var(--vermil-d)] hover:bg-vermil-l hover:shadow-[4px_4px_0_var(--vermil-d)]",
  sage: "bg-sage border-sage text-cream shadow-[3px_3px_0_rgba(74,102,80,.4)] hover:bg-sage-l",
  gold: "bg-gold border-gold text-cream shadow-[3px_3px_0_rgba(154,122,32,.4)] hover:bg-gold-l",
  ghost:
    "bg-transparent border-transparent text-driftwood hover:text-oak hover:border-oak",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-[18px] py-2 text-xs",
  lg: "px-5 py-2.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // Base styles from prototype
          "inline-flex items-center justify-center gap-1.5",
          "border-[1.5px] cursor-pointer",
          "font-[var(--font-mono)] font-medium tracking-wider uppercase",
          "transition-all duration-100",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
          // Minimum touch target
          "min-h-[44px]",
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
