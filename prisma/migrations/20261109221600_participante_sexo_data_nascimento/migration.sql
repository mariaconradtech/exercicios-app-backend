-- Dados demográficos reais para o Painel do Pesquisador (idade e sexo).
-- Colunas opcionais: participantes cadastrados antes desta migration não têm
-- esse dado — o painel exibe "Sem dados" para eles, sem valores inventados.

-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('FEMININO', 'MASCULINO');

-- AlterTable
ALTER TABLE "participante"
ADD COLUMN "data_nascimento" DATE,
ADD COLUMN "sexo" "Sexo";
