-- Perfil de administrador da área web: cadastra pesquisadores e participantes.
ALTER TYPE "TipoUsuario" ADD VALUE 'ADMIN';

CREATE TABLE "administrador" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "senha" TEXT NOT NULL,

    CONSTRAINT "administrador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "administrador_usuario_id_key" ON "administrador"("usuario_id");

ALTER TABLE "administrador" ADD CONSTRAINT "administrador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
