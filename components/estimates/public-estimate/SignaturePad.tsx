"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface SignaturePadHandle {
  /** Returns null if the user hasn't drawn anything. */
  getDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

type Stroke = { x: number; y: number }[];

function readThemeColors() {
  if (typeof window === "undefined") {
    return { bg: "#ffffff", ink: "#1a1a17" };
  }
  const cs = getComputedStyle(document.documentElement);
  const surface = cs.getPropertyValue("--surface").trim() || "#ffffff";
  const ink = cs.getPropertyValue("--ink").trim() || "#1a1a17";
  return { bg: surface, ink };
}

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { onChange?: (hasInk: boolean) => void }
>(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const drawingRef = useRef(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const { bg, ink } = readThemeColors();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ink;
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * ratio;
    canvas.height = r.height * ratio;
    redraw();

    // Re-render when the theme attribute on <html> flips so the canvas
    // matches the surrounding surface in both light and dark modes.
    const observer = new MutationObserver(() => redraw());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => observer.disconnect();
  }, [redraw]);

  function getPt(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const p = getPt(e);
    if (!p) return;
    drawingRef.current = true;
    currentStrokeRef.current = [p];
    strokesRef.current.push(currentStrokeRef.current);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = getPt(e);
    const stroke = currentStrokeRef.current;
    if (!p || !stroke) return;
    const last = stroke[stroke.length - 1];
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    stroke.push(p);
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    currentStrokeRef.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }

  useImperativeHandle(
    ref,
    () => ({
      getDataUrl: () => {
        if (!hasInk) return null;
        // Render the captured strokes onto an offscreen white canvas with
        // dark ink so the stored PNG looks the same regardless of which
        // theme the customer used to sign.
        const display = canvasRef.current;
        if (!display) return null;
        const r = display.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const off = document.createElement("canvas");
        off.width = r.width * ratio;
        off.height = r.height * ratio;
        const ctx = off.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, off.width, off.height);
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#1a1a17";
        for (const stroke of strokesRef.current) {
          if (stroke.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(stroke[0].x, stroke[0].y);
          for (let i = 1; i < stroke.length; i++) {
            ctx.lineTo(stroke[i].x, stroke[i].y);
          }
          ctx.stroke();
        }
        return off.toDataURL("image/png");
      },
      isEmpty: () => !hasInk,
      clear: () => {
        strokesRef.current = [];
        currentStrokeRef.current = null;
        setHasInk(false);
        onChange?.(false);
        redraw();
      },
    }),
    [hasInk, onChange, redraw]
  );

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className={`w-full h-[130px] bg-[var(--surface)] border-[1.5px] ${
          hasInk
            ? "border-solid border-[var(--ink)]"
            : "border-dashed border-[var(--line-2)]"
        } rounded-md cursor-crosshair touch-none block`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {!hasInk && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-[var(--font-hand,cursive)] text-[22px] text-[var(--muted)] pointer-events-none font-[500]">
          Sign here
        </span>
      )}
    </div>
  );
});
