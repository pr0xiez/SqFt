"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { cn } from "@/lib/cn";

interface ToastData {
  title: string;
  body?: string;
}

interface ToastProps extends ToastData {
  duration?: number;
  onDismiss: () => void;
}

function Toast({ title, body, duration = 2400, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-[999]",
        "bg-[var(--ink)] text-[var(--bg)] px-[18px] py-[14px] rounded-lg",
        "shadow-[0_10px_30px_rgba(0,0,0,0.2)] max-w-[340px]",
        "transition-all duration-300",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2.5 pointer-events-none",
        "animate-[slideUp_0.3s_ease_both]"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="text-[13px] font-[600] tracking-[-0.01em]">{title}</div>
      {body && (
        <div className="font-[var(--font-mono)] text-[11px] opacity-80 mt-0.5">
          {body}
        </div>
      )}
    </div>
  );
}

// ── Toast Provider / Hook ─────────────────────────────────────────────────

interface ToastContextValue {
  showToast: (title: string, body?: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastItem {
  id: number;
  title: string;
  body?: string;
  duration?: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = { current: 0 };

  const showToast = useCallback(
    (title: string, body?: string, duration?: number) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, title, body, duration }]);
    },
    [counter]
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.map((t) => (
        <Toast
          key={t.id}
          title={t.title}
          body={t.body}
          duration={t.duration}
          onDismiss={() => dismiss(t.id)}
        />
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
