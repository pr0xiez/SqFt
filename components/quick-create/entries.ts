import {
  CalendarPlusIcon,
  FileTextIcon,
  type Icon,
  ReceiptIcon,
  RulerIcon,
  UserPlusIcon,
} from "@/components/ui/icons";
import type { QuickCreateKind } from "./QuickCreateProvider";

/**
 * The "+ New" menu, in record-chain order. Shared by the sidebar dropdown
 * (`NewMenu`), the mobile tab bar's sheet (`NewSheet`) and the nav drawer.
 */
export const QUICK_CREATE_ENTRIES: ReadonlyArray<{
  kind: QuickCreateKind;
  label: string;
  hint: string;
  icon: Icon;
}> = [
  {
    kind: "customer",
    label: "New customer",
    hint: "A lead and their job address",
    icon: UserPlusIcon,
  },
  {
    kind: "siteMeasure",
    label: "New site measure",
    hint: "Measure one of their locations",
    icon: RulerIcon,
  },
  {
    kind: "estimate",
    label: "New estimate",
    hint: "Price a site measure",
    icon: FileTextIcon,
  },
  {
    kind: "invoice",
    label: "New invoice",
    hint: "Bill an estimate",
    icon: ReceiptIcon,
  },
  {
    kind: "event",
    label: "New event",
    hint: "Book a visit or a job",
    icon: CalendarPlusIcon,
  },
];
