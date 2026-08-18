-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('PESQUISADOR', 'PARTICIPANTE');

-- CreateEnum
CREATE TYPE "GeneroAvatar" AS ENUM ('FEMININO', 'MASCULINO');

-- CreateEnum
CREATE TYPE "FaseTreino" AS ENUM ('INICIANTE', 'INTERMEDIARIO', 'AVANCADO');

-- CreateEnum
CREATE TYPE "StatusSessao" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA', 'INCOMPLETA', 'INTERROMPIDA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT,
    "tipo" "TipoUsuario" NOT NULL DEFAULT 'PARTICIPANTE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participante" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "id_externo" TEXT,
    "cpf" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "data_adesao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_gamificado" (
    "participante_id" INTEGER NOT NULL,
    "avatar_genero" "GeneroAvatar" NOT NULL,
    "avatar_personagem" TEXT NOT NULL,
    "nome_avatar" TEXT,
    "fase_atual" "FaseTreino" NOT NULL DEFAULT 'INICIANTE',
    "nivel_atual" INTEGER NOT NULL DEFAULT 1,
    "pontos" INTEGER NOT NULL DEFAULT 0,
    "estrelas" INTEGER NOT NULL DEFAULT 0,
    "medalhas" INTEGER NOT NULL DEFAULT 0,
    "trofeus" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "perfil_gamificado_pkey" PRIMARY KEY ("participante_id")
);

-- CreateTable
CREATE TABLE "pesquisador" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "universidade" TEXT NOT NULL,

    CONSTRAINT "pesquisador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercicio" (
    "id" SERIAL NOT NULL,
    "pesquisador_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "instrucao" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "exercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treino" (
    "id" SERIAL NOT NULL,
    "pesquisador_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "fase" "FaseTreino" NOT NULL,
    "nivel" INTEGER NOT NULL,
    "quantidade_semanas" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "treino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treino_exercicio" (
    "treino_id" INTEGER NOT NULL,
    "exercicio_id" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,
    "series" INTEGER NOT NULL,
    "descanso_segundos" INTEGER NOT NULL,
    "multiplicador_velocidade" DOUBLE PRECISION NOT NULL,
    "duracao_estimada_segundos" INTEGER NOT NULL,

    CONSTRAINT "treino_exercicio_pkey" PRIMARY KEY ("treino_id","exercicio_id")
);

-- CreateTable
CREATE TABLE "sessao_treino" (
    "id" SERIAL NOT NULL,
    "participante_id" INTEGER NOT NULL,
    "treino_id" INTEGER NOT NULL,
    "data_inicio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_fim" TIMESTAMPTZ(3),
    "tempo_realizado_segundos" INTEGER,
    "percentual_concluido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "StatusSessao" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "esforco_omni" INTEGER,
    "pontos_ganhos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sessao_treino_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "participante_usuario_id_key" ON "participante"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "participante_id_externo_key" ON "participante"("id_externo");

-- CreateIndex
CREATE UNIQUE INDEX "participante_cpf_key" ON "participante"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "pesquisador_usuario_id_key" ON "pesquisador"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nome_key" ON "categoria"("nome");

-- AddForeignKey
ALTER TABLE "participante" ADD CONSTRAINT "participante_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_gamificado" ADD CONSTRAINT "perfil_gamificado_participante_id_fkey" FOREIGN KEY ("participante_id") REFERENCES "participante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesquisador" ADD CONSTRAINT "pesquisador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercicio" ADD CONSTRAINT "exercicio_pesquisador_id_fkey" FOREIGN KEY ("pesquisador_id") REFERENCES "pesquisador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercicio" ADD CONSTRAINT "exercicio_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treino" ADD CONSTRAINT "treino_pesquisador_id_fkey" FOREIGN KEY ("pesquisador_id") REFERENCES "pesquisador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treino_exercicio" ADD CONSTRAINT "treino_exercicio_treino_id_fkey" FOREIGN KEY ("treino_id") REFERENCES "treino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treino_exercicio" ADD CONSTRAINT "treino_exercicio_exercicio_id_fkey" FOREIGN KEY ("exercicio_id") REFERENCES "exercicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao_treino" ADD CONSTRAINT "sessao_treino_participante_id_fkey" FOREIGN KEY ("participante_id") REFERENCES "participante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao_treino" ADD CONSTRAINT "sessao_treino_treino_id_fkey" FOREIGN KEY ("treino_id") REFERENCES "treino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
