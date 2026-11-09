-- A migration init_db foi editada depois de aplicada (TIMESTAMP -> TIMESTAMPTZ), então
-- bancos antigos ficaram com data_inicio/data_fim sem fuso. Converte só nesses casos;
-- em bancos criados do zero a coluna já é TIMESTAMPTZ e nada muda.
-- Os valores existentes foram gravados em UTC pelo Prisma.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'sessao_treino'
      AND column_name = 'data_inicio'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "sessao_treino"
      ALTER COLUMN "data_inicio" SET DATA TYPE TIMESTAMPTZ(3) USING "data_inicio" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'sessao_treino'
      AND column_name = 'data_fim'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "sessao_treino"
      ALTER COLUMN "data_fim" SET DATA TYPE TIMESTAMPTZ(3) USING "data_fim" AT TIME ZONE 'UTC';
  END IF;
END $$;
