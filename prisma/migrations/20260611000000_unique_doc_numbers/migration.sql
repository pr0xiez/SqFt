-- Add per-org unique constraints on document numbers (Estimate.estimateNumber
-- and SiteMeasure.siteMeasureNumber). Invoice already has its @@unique.
--
-- The CREATE paths used to allocate these numbers with a non-atomic
-- read-then-write, so a populated DB may already contain duplicate
-- (orgId, number) rows. Creating the unique index on such data would fail, so
-- we DEDUPE first: every duplicate row keeps the lowest id at its original
-- number and the rest are renumbered to fresh values above the org's current
-- max. We then advance the per-org counter past every assigned number so future
-- allocations never collide with a renumbered row.

-- ── Estimate dedupe ──────────────────────────────────────────────────────────
-- Renumber duplicate (orgId, estimateNumber) rows. Keep the lowest-id row at its
-- existing number; push the others to MAX(estimateNumber)+row_offset per org.
WITH ranked AS (
  SELECT
    id,
    "orgId",
    "estimateNumber",
    ROW_NUMBER() OVER (
      PARTITION BY "orgId", "estimateNumber" ORDER BY id
    ) AS dup_rank
  FROM "Estimate"
),
org_max AS (
  SELECT "orgId", MAX("estimateNumber") AS max_num
  FROM "Estimate"
  GROUP BY "orgId"
),
-- The duplicates (dup_rank > 1) that need a fresh number, ordered stably so we
-- can assign sequential values above each org's max.
dupes AS (
  SELECT
    r.id,
    r."orgId",
    om.max_num + ROW_NUMBER() OVER (
      PARTITION BY r."orgId" ORDER BY r.id
    ) AS new_num
  FROM ranked r
  JOIN org_max om ON om."orgId" = r."orgId"
  WHERE r.dup_rank > 1
)
UPDATE "Estimate" e
SET "estimateNumber" = d.new_num
FROM dupes d
WHERE e.id = d.id;

-- Advance each org's counter past the highest estimateNumber now in use.
UPDATE "Organization" o
SET "nextEstimateNumber" = GREATEST(
  o."nextEstimateNumber",
  (SELECT MAX(e."estimateNumber") + 1 FROM "Estimate" e WHERE e."orgId" = o.id)
)
WHERE EXISTS (SELECT 1 FROM "Estimate" e WHERE e."orgId" = o.id);

-- ── SiteMeasure dedupe ───────────────────────────────────────────────────────
-- siteMeasureNumber is nullable; NULLs are treated as distinct by Postgres, so
-- they need no dedupe. Only renumber non-NULL duplicates.
WITH ranked AS (
  SELECT
    id,
    "orgId",
    "siteMeasureNumber",
    ROW_NUMBER() OVER (
      PARTITION BY "orgId", "siteMeasureNumber" ORDER BY id
    ) AS dup_rank
  FROM "SiteMeasure"
  WHERE "siteMeasureNumber" IS NOT NULL
),
org_max AS (
  SELECT "orgId", MAX("siteMeasureNumber") AS max_num
  FROM "SiteMeasure"
  WHERE "siteMeasureNumber" IS NOT NULL
  GROUP BY "orgId"
),
dupes AS (
  SELECT
    r.id,
    r."orgId",
    om.max_num + ROW_NUMBER() OVER (
      PARTITION BY r."orgId" ORDER BY r.id
    ) AS new_num
  FROM ranked r
  JOIN org_max om ON om."orgId" = r."orgId"
  WHERE r.dup_rank > 1
)
UPDATE "SiteMeasure" s
SET "siteMeasureNumber" = d.new_num
FROM dupes d
WHERE s.id = d.id;

-- Advance each org's counter past the highest siteMeasureNumber now in use.
UPDATE "Organization" o
SET "nextSiteMeasureNumber" = GREATEST(
  o."nextSiteMeasureNumber",
  (
    SELECT MAX(s."siteMeasureNumber") + 1
    FROM "SiteMeasure" s
    WHERE s."orgId" = o.id AND s."siteMeasureNumber" IS NOT NULL
  )
)
WHERE EXISTS (
  SELECT 1 FROM "SiteMeasure" s
  WHERE s."orgId" = o.id AND s."siteMeasureNumber" IS NOT NULL
);

-- ── Constraints ──────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "Estimate_orgId_estimateNumber_key"
  ON "Estimate"("orgId", "estimateNumber");

CREATE UNIQUE INDEX "SiteMeasure_orgId_siteMeasureNumber_key"
  ON "SiteMeasure"("orgId", "siteMeasureNumber");
