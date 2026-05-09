import { cn } from "@/lib/cn";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "w-[10px] h-[10px] text-[7px]",
  md: "w-[18px] h-[18px] text-[9px]",
  lg: "w-[20px] h-[20px] text-[10px]",
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
        "inline-flex items-center justify-center rounded-full bg-[var(--ink-2)] text-white font-[700] font-[var(--font-mono)] flex-shrink-0",
        SIZES[size],
        className
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
