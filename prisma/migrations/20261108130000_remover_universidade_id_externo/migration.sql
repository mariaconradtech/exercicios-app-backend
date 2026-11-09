-- Remove campos não utilizados nos cadastros da área web.
DROP INDEX IF EXISTS "participante_id_externo_key";
ALTER TABLE "participante" DROP COLUMN "id_externo";

ALTER TABLE "pesquisador" DROP COLUMN "universidade";
