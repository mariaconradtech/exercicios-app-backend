-- Velocidade de reprodução do vídeo de cada exercício dentro do treino (1 = velocidade original).
ALTER TABLE "treino_exercicio" ADD COLUMN "velocidade_execucao" DOUBLE PRECISION NOT NULL DEFAULT 1;
