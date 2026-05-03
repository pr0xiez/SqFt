"use client";

import { useEffect, useRef } from "react";
import type { RoomItem } from "@/lib/utils";
import { parsef, roomSqft } from "@/lib/utils";

interface Props {
  room: RoomItem;
  width?: number;
  height?: number;
}

const SAGE = "#4a6650";
const OAK = "#3d3228";
const _LINEN = "#f5f0e8";

export function RoomCanvas({ room, width = 180, height = 110 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
    ctx.fillStyle =
      room.shape === "tri" ? "rgba(74,102,80,.15)" : "rgba(74,102,80,.12)";
    ctx.strokeStyle = SAGE;
    ctx.lineWidth = 1.5;

    if (room.shape === "tri") {
      ctx.beginPath();
      ctx.moveTo(x, y + rl);
      ctx.lineTo(x + rw, y + rl);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, rw, rl);
      ctx.strokeRect(x, y, rw, rl);
    }

    // Area label
    ctx.fillStyle = OAK;
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
