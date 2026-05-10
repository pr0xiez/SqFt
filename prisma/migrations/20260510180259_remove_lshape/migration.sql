-- Convert any existing L-shape rooms to rectangles before dropping the column.
-- Net L-shape area is preserved by keeping the rect w/l that were already stored;
-- the original lshapeData JSON (sections/deductions) is intentionally discarded.
UPDATE "EstimateItem" SET "shape" = 'rect' WHERE "shape" = 'lshape';

-- DropColumn
ALTER TABLE "EstimateItem" DROP COLUMN "lshapeData";
