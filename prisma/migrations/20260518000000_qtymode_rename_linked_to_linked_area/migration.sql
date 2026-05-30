-- Rename the legacy LineItem.qtyMode value "linked" to "linked_area" to pair
-- symmetrically with "linked_perimeter". The string is the source of truth
-- on disk and over the wire — see `QtyMode` in lib/utils.ts.
UPDATE "LineItem" SET "qtyMode" = 'linked_area' WHERE "qtyMode" = 'linked';
