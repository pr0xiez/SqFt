"use client";

import {
  forwardRef,
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

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { onChange?: (hasInk: boolean) => void }
>(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * ratio;
    canvas.height = r.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a17";
  }, []);

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
    lastPtRef.current = p;
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = getPt(e);
    const last = lastPtRef.current;
    if (!p || !last) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPtRef.current = p;
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    lastPtRef.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }

  useImperativeHandle(
    ref,
    () => ({
      getDataUrl: () =>
        hasInk ? (canvasRef.current?.toDataURL("image/png") ?? null) : null,
      isEmpty: () => !hasInk,
      clear: () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasInk(false);
        onChange?.(false);
      },
    }),
    [hasInk, onChange]
  );

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className={`w-full h-[130px] bg-[var(--paper)] border-[1.5px] ${
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
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-[var(--font-hand,cursive)] text-[22px] text-[var(--line-2)] pointer-events-none font-[500]">
          Sign here
        </span>
      )}
    </div>
  );
});
