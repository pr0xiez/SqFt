import { type RoomItem, roomSegments, roomSqft } from "@/lib/utils";

interface Props {
  rooms: RoomItem[];
}

export function RoomsList({ rooms }: Props) {
  if (rooms.length === 0) return null;
  return (
    <>
      <div className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.08em] mb-3.5">
        Rooms included
      </div>
      <div className="flex flex-wrap gap-1.5 mb-9">
        {rooms.map((r) => {
          const sqft = Math.round(roomSqft(r));
          const boxes = roomSegments(r);
          const first = boxes[0];
          const dim =
            boxes.length > 1
              ? `${boxes.length} areas`
              : first?.w && first?.l
                ? `${first.l}×${first.w}`
                : "";
          return (
            <span
              key={r.id}
              className="font-[var(--font-mono)] text-[11px] px-3 py-1.5 border border-[var(--line-2)] rounded-full text-[var(--ink-2)] bg-[var(--surface)] inline-flex items-center gap-1.5"
            >
              <strong className="text-[var(--ink)] font-[600]">
                {r.name || "Room"}
              </strong>
              <span className="text-[var(--muted)]">
                {dim ? `${dim} · ` : ""}
                {sqft} sqft
              </span>
            </span>
          );
        })}
      </div>
    </>
  );
}
