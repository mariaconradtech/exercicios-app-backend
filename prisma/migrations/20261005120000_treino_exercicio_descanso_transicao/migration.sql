-- O descanso entre exercícios diferentes deixa de ser um valor único por
-- treino e passa a ser definido por exercício (descanso a observar depois
-- de concluir aquele exercício, antes de iniciar o próximo).
ALTER TABLE "treino_exercicio"
  ADD COLUMN "descanso_transicao_segundos" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "treino"
  DROP COLUMN "descanso_entre_series_segundos";
