/** Common residential room names offered by the site-measure room picker,
 *  grouped the way the dropdown shows them. Any other name is a custom one
 *  the user typed (the picker's "Custom…" option); nothing on the server
 *  restricts names to this list. */
export const ROOM_NAME_GROUPS: ReadonlyArray<{
  label: string;
  names: readonly string[];
}> = [
  {
    label: "Living",
    names: [
      "Living Room",
      "Family Room",
      "Great Room",
      "Den",
      "Kitchen",
      "Dining Room",
      "Breakfast Nook",
      "Pantry",
      "Office",
      "Bonus Room",
      "Sunroom",
    ],
  },
  {
    label: "Bedrooms",
    names: [
      "Master Bedroom",
      "Bedroom",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
      "Guest Bedroom",
      "Closet",
      "Walk-in Closet",
    ],
  },
  {
    label: "Bathrooms",
    names: ["Master Bathroom", "Bathroom", "Half Bath"],
  },
  {
    label: "Halls & entry",
    names: ["Entry", "Foyer", "Hallway", "Stairs", "Landing"],
  },
  {
    label: "Utility",
    names: ["Laundry Room", "Mudroom", "Basement", "Garage"],
  },
];

const PRESETS = new Set(ROOM_NAME_GROUPS.flatMap((g) => g.names));

/** True when `name` is exactly one of the picker's preset room names. */
export function isPresetRoomName(name: string | null | undefined): boolean {
  return name != null && PRESETS.has(name);
}
