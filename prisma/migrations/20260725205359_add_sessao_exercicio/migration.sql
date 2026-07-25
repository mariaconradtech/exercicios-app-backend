-- CreateTable
CREATE TABLE "sessao_exercicio" (
    "id" SERIAL NOT NULL,
    "sessao_id" INTEGER NOT NULL,
    "exercicio_id" INTEGER NOT NULL,
    "series_concluidas" INTEGER NOT NULL DEFAULT 0,
    "concluido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sessao_exercicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessao_exercicio_sessao_id_exercicio_id_key" ON "sessao_exercicio"("sessao_id", "exercicio_id");

-- AddForeignKey
ALTER TABLE "sessao_exercicio" ADD CONSTRAINT "sessao_exercicio_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "sessao_treino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao_exercicio" ADD CONSTRAINT "sessao_exercicio_exercicio_id_fkey" FOREIGN KEY ("exercicio_id") REFERENCES "exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
