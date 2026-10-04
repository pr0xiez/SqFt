"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
        "fixed z-[900] left-4 right-4 sm:left-auto sm:right-6 sm:w-auto",
        "bottom-[calc(72px+env(safe-area-inset-bottom,0px))] md:bottom-6",
        "bg-[var(--ink)] text-[var(--bg)] px-4 py-3.5 rounded-[var(--r)]",
        "shadow-[var(--shadow-md)] sm:max-w-[360px]",
        "transition-[opacity,transform] duration-300 ease-[var(--ease)]",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2.5 pointer-events-none",
        "animate-[slideUp_.36s_var(--ease)_backwards]"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="text-[14.5px] font-[620] tracking-[-0.005em]">
        {title}
      </div>
      {body && <div className="text-[13.5px] opacity-75 mt-0.5">{body}</div>}
    </div>
  );
}

// ── Toast Provider / Hook ───────────────────────────────────────────────────

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
  const counter = useRef(0);

  const showToast = useCallback(
    (title: string, body?: string, duration?: number) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, title, body, duration }]);
    },
    []
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
