"use client";

import { useEffect, useRef } from "react";
import type { RoomItem } from "@/lib/utils";
import { parsef, roomSqft } from "@/lib/utils";

interface Props {
  room: RoomItem;
  width?: number;
  height?: number;
}

export function RoomCanvas({ room, width = 180, height = 110 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const style = getComputedStyle(document.documentElement);
    const sage = style.getPropertyValue("--sage").trim() || "#3d6b4a";
    const inkColor = style.getPropertyValue("--ink-2").trim() || "#3a3a35";

    ctx.clearRect(0, 0, width, height);

    const w = parsef(room.w);
    const l = parsef(room.l);
    if (!w || !l || w <= 0 || l <= 0) return;

    const pad = 16;
    const scale = Math.min((width - pad * 2) / w, (height - pad * 2 - 16) / l);
    const rw = w * scale;
    const rl = l * scale;
    const x = (width - rw) / 2;
    const y = (height - rl - 16) / 2;

    // Fill
    ctx.fillStyle = sage;
    ctx.strokeStyle = sage;
    ctx.lineWidth = 1.5;

    if (room.shape === "tri") {
      ctx.beginPath();
      ctx.moveTo(x, y + rl);
      ctx.lineTo(x + rw, y + rl);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.globalAlpha = room.shape === "tri" ? 0.15 : 0.12;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.12;
      ctx.fillRect(x, y, rw, rl);
      ctx.globalAlpha = 1;
      ctx.strokeRect(x, y, rw, rl);
    }

    // Area label
    ctx.fillStyle = inkColor;
    ctx.font = `bold 11px 'Azeret Mono', monospace`;
    ctx.textAlign = "center";
    const area = roomSqft(room);
    ctx.fillText(`${Math.round(area * 10) / 10} ft²`, width / 2, y + rl + 14);
  }, [room, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="block"
      aria-label={`Room diagram: ${room.name}`}
    />
  );
}
