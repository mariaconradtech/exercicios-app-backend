-- Restore the active flag for treino selection.
ALTER TABLE "treino"
  ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;

-- Restore explicit execution order for exercises inside a treino.
ALTER TABLE "treino_exercicio"
  ADD COLUMN "ordem" INTEGER;

-- Preserve a stable order for rows created before the column was restored.
WITH exercicios_ordenados AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "treino_id" ORDER BY "id") AS "ordem_calculada"
  FROM "treino_exercicio"
)
UPDATE "treino_exercicio" AS te
SET "ordem" = eo."ordem_calculada"
FROM exercicios_ordenados AS eo
WHERE te."id" = eo."id";

ALTER TABLE "treino_exercicio"
  ALTER COLUMN "ordem" SET NOT NULL;
