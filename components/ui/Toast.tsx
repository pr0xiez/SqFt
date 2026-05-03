"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

interface ToastProps {
  message: string;
  duration?: number;
  onDismiss: () => void;
}

export function Toast({ message, duration = 3200, onDismiss }: ToastProps) {
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
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-[500]",
        "bg-oak text-linen px-5 py-3",
        "border-[1.5px] border-driftwood",
        "shadow-[3px_3px_0_rgba(61,50,40,.5)]",
        "font-[var(--font-mono)] text-sm tracking-wide",
        "transition-all duration-300",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-3 pointer-events-none",
        "animate-[toastIn_0.3s_ease-out]"
      )}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

// ── Toast Provider / Hook ─────────────────────────────────────────────────

import { createContext, type ReactNode, useCallback, useContext } from "react";

interface ToastContextValue {
  showToast: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastItem {
  id: number;
  message: string;
  duration?: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = { current: 0 };

  const showToast = useCallback(
    (message: string, duration?: number) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, message, duration }]);
    },
    [counter]
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
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
