import {
  CalendarCheckIcon,
  CalendarDotsIcon,
  DotsThreeIcon,
  FileTextIcon,
  GearSixIcon,
  HouseIcon,
  type Icon,
  ReceiptIcon,
  RulerIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "@/components/ui/icons";
import type { IconId } from "@/lib/nav/items";

const ICONS: Record<IconId, Icon> = {
  dashboard: HouseIcon,
  customers: UsersIcon,
  siteMeasures: RulerIcon,
  estimates: FileTextIcon,
  invoices: ReceiptIcon,
  myschedule: CalendarCheckIcon,
  scheduleManager: CalendarDotsIcon,
  settings: GearSixIcon,
  admin: ShieldCheckIcon,
  more: DotsThreeIcon,
};

/** Navigation glyphs. Active destinations switch to the filled weight. */
export function NavIcon({
  icon,
  active = false,
  size = 20,
  title,
}: {
  icon: IconId;
  active?: boolean;
  size?: number;
  title?: string;
}) {
  const Glyph = ICONS[icon];
  return (
    <Glyph
      size={size}
      weight={active ? "fill" : "regular"}
      className="shrink-0"
      {...(title ? { alt: title } : { "aria-hidden": true })}
    />
  );
}
