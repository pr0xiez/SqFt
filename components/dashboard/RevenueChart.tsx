"use client";

import { useEffect, useRef } from "react";
import type { Estimate } from "@/lib/hooks/useEstimates";
import { computeEstimateTotal } from "@/lib/utils";

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
        const rev = monthEstimates.reduce((sum, e) => {
          const t = computeEstimateTotal(e);
          if (!t) return sum;
          return sum + parseInt(t.replace(/[$,]/g, ""), 10);
        }, 0);
        revenues.push(rev);
      }

      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      const rootStyle = getComputedStyle(document.documentElement);
      const accentColor = rootStyle.getPropertyValue("--accent").trim() || "#c0341a";
      const mutedColor = rootStyle.getPropertyValue("--muted").trim() || "#6b6b66";
      const lineColor = rootStyle.getPropertyValue("--line").trim() || "#e6e4dd";

      const gradient = ctx.createLinearGradient(0, 0, 0, 200);
      gradient.addColorStop(0, `${accentColor}44`);
      gradient.addColorStop(1, `${accentColor}00`);

      chartRef.current = new ChartJS(canvasRef.current, {
        type: "line",
        data: {
          labels: months,
          datasets: [
            {
              label: "Revenue",
              data: revenues,
              borderColor: accentColor,
              backgroundColor: gradient,
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: accentColor,
              borderWidth: 2,
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
                color: mutedColor,
              },
              grid: { color: lineColor },
              border: { color: lineColor },
            },
            x: {
              ticks: {
                font: { family: "'JetBrains Mono', monospace", size: 10 },
                color: mutedColor,
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
    <div className="h-[200px]">
      <canvas ref={canvasRef} />
    </div>
  );
}
