-- DropForeignKey
ALTER TABLE "treino" DROP CONSTRAINT "treino_pesquisador_id_fkey";

-- AlterTable: treino agora segue exatamente o contrato do módulo de Treinos
ALTER TABLE "treino"
  ADD COLUMN "instrucoes" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "descanso_entre_series_segundos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "duracao_estimada_minutos" INTEGER NOT NULL DEFAULT 0;

-- Preenche instrucoes com o conteúdo antigo de descricao, quando existir, antes de remover a coluna
UPDATE "treino" SET "instrucoes" = COALESCE("descricao", '') WHERE "instrucoes" = '';

ALTER TABLE "treino"
  ALTER COLUMN "instrucoes" DROP DEFAULT,
  ALTER COLUMN "descanso_entre_series_segundos" DROP DEFAULT,
  ALTER COLUMN "duracao_estimada_minutos" DROP DEFAULT,
  DROP COLUMN "ativo",
  DROP COLUMN "descricao",
  DROP COLUMN "pesquisador_id";

-- AlterTable: treino_exercicio passa a ter chave própria (id) em vez de chave composta,
-- e perde os campos "ordem" e "duracao_estimada_segundos" (não fazem parte do contrato)
ALTER TABLE "treino_exercicio" DROP CONSTRAINT "treino_exercicio_pkey";

ALTER TABLE "treino_exercicio"
  ADD COLUMN "id" SERIAL NOT NULL,
  DROP COLUMN "ordem",
  DROP COLUMN "duracao_estimada_segundos";

ALTER TABLE "treino_exercicio" ADD CONSTRAINT "treino_exercicio_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "treino_exercicio_treino_id_exercicio_id_key" ON "treino_exercicio"("treino_id", "exercicio_id");
