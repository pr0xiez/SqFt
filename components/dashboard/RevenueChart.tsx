"use client";

import { useEffect, useRef } from "react";
import type { Estimate } from "@/lib/hooks/useEstimates";

let _Chart: typeof import("chart.js").Chart | null = null;

interface Props {
  estimates: Estimate[];
}

export function RevenueChart({ estimates }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import("chart.js").Chart | null>(null);

  useEffect(() => {
    async function init() {
      if (!canvasRef.current) return;

      const { Chart: ChartJS, registerables } = await import("chart.js");
      ChartJS.register(...registerables);
      _Chart = ChartJS;

      if (chartRef.current) {
        chartRef.current.destroy();
      }

      const months: string[] = [];
      const revenues: number[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = d.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        });
        months.push(label);

        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthEstimates = estimates.filter(
          (e) => e.status === "completed" && e.date.slice(0, 7) === monthStr
        );
        revenues.push(monthEstimates.length * 4500);
      }

      chartRef.current = new ChartJS(canvasRef.current, {
        type: "bar",
        data: {
          labels: months,
          datasets: [
            {
              label: "Revenue",
              data: revenues,
              backgroundColor: "rgba(61,107,74,.7)",
              borderColor: "#3d6b4a",
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => `$${Number(v).toLocaleString()}`,
                font: { family: "'JetBrains Mono', monospace", size: 10 },
                color: "#6b6b66",
              },
              grid: { color: "#e6e4dd" },
              border: { color: "#e6e4dd" },
            },
            x: {
              ticks: {
                font: { family: "'JetBrains Mono', monospace", size: 10 },
                color: "#6b6b66",
              },
              grid: { display: false },
              border: { color: "#e6e4dd" },
            },
          },
        },
      });
    }

    init();

    return () => {
      chartRef.current?.destroy();
    };
  }, [estimates]);

  return (
    <div className="h-48">
      <canvas ref={canvasRef} />
    </div>
  );
}
