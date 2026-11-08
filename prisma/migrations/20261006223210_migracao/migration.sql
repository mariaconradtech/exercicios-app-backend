/*
  Warnings:

  - You are about to drop the column `criado_em` on the `exercicio` table. All the data in the column will be lost.
  - You are about to drop the column `nivel` on the `exercicio` table. All the data in the column will be lost.
  - The primary key for the `sessao_exercicio` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `sessao_exercicio` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "sessao_exercicio" DROP CONSTRAINT "sessao_exercicio_exercicio_id_fkey";

-- DropIndex
DROP INDEX "sessao_exercicio_sessao_id_exercicio_id_key";

-- AlterTable
ALTER TABLE "exercicio" DROP COLUMN "criado_em",
DROP COLUMN "nivel";

-- AlterTable
ALTER TABLE "sessao_exercicio" DROP CONSTRAINT "sessao_exercicio_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "sessao_exercicio_pkey" PRIMARY KEY ("sessao_id", "exercicio_id");

-- AddForeignKey
ALTER TABLE "sessao_exercicio" ADD CONSTRAINT "sessao_exercicio_exercicio_id_fkey" FOREIGN KEY ("exercicio_id") REFERENCES "exercicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
