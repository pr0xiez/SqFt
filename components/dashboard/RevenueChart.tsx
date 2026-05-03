"use client";

import { useEffect, useRef } from "react";
import type { Estimate } from "@/lib/hooks/useEstimates";

// Dynamically import Chart.js to avoid SSR issues
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

      // Dynamic import to avoid SSR
      const { Chart: ChartJS, registerables } = await import("chart.js");
      ChartJS.register(...registerables);
      _Chart = ChartJS;

      // Destroy existing chart
      if (chartRef.current) {
        chartRef.current.destroy();
      }

      // Build last-6-months revenue data from completed estimates
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

        // Placeholder: real calculation would use estimate totals
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthEstimates = estimates.filter(
          (e) => e.status === "completed" && e.date.slice(0, 7) === monthStr
        );
        revenues.push(monthEstimates.length * 4500); // placeholder avg
      }

      chartRef.current = new ChartJS(canvasRef.current, {
        type: "bar",
        data: {
          labels: months,
          datasets: [
            {
              label: "Revenue",
              data: revenues,
              backgroundColor: "rgba(74,102,80,0.7)",
              borderColor: "#4a6650",
              borderWidth: 1.5,
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
                font: { family: "'Azeret Mono', monospace", size: 10 },
              },
              grid: { color: "rgba(61,50,40,.06)" },
            },
            x: {
              ticks: {
                font: { family: "'Azeret Mono', monospace", size: 10 },
              },
              grid: { display: false },
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
