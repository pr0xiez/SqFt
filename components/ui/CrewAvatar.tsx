import { cn } from "@/lib/cn";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "size-[18px] text-[10px]",
  md: "size-[22px] text-[11.5px]",
  lg: "size-[26px] text-[12.5px]",
};

interface CrewAvatarProps {
  name: string;
  size?: Size;
  className?: string;
}

export function CrewAvatar({ name, size = "md", className }: CrewAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full shrink-0",
        "bg-[var(--ink)] text-[var(--bg)] font-[700] leading-none",
        SIZES[size],
        className
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
