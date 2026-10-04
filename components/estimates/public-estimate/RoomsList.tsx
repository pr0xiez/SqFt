import { type RoomItem, roomSegments, roomSqft } from "@/lib/utils";

interface Props {
  rooms: RoomItem[];
}

export function RoomsList({ rooms }: Props) {
  if (rooms.length === 0) return null;
  return (
    <section className="mb-8 sm:mb-9">
      <h2 className="text-[14px] font-[620] text-[var(--ink)] mb-3">
        Rooms included
      </h2>
      <div className="flex flex-wrap gap-2">
        {rooms.map((r) => {
          const sqft = Math.round(roomSqft(r));
          const boxes = roomSegments(r);
          const first = boxes[0];
          const dim =
            boxes.length > 1
              ? `${boxes.length} areas`
              : first?.w && first?.l
                ? `${first.w}×${first.l}`
                : "";
          return (
            <span
              key={r.id}
              className="inline-flex items-baseline gap-2 min-h-[32px] py-1.5 px-2.5 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[13.5px]"
            >
              <strong className="text-[var(--ink)] font-[600]">
                {r.name || "Room"}
              </strong>
              <span className="type-figure text-[13px] text-[var(--muted)]">
                {dim ? `${dim} · ` : ""}
                {sqft} sqft
              </span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
