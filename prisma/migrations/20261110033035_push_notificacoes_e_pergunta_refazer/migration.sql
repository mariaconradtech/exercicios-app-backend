-- Suporte a Push Notifications (lembrete padrão, lembrete repetido e lembrete
-- semanal) e à "terceira mensagem" do fluxo de finalização antecipada de treino.

-- AlterTable: Participante
ALTER TABLE "participante"
ADD COLUMN "expo_push_token" TEXT,
ADD COLUMN "ultimo_lembrete_padrao_enviado_em" TIMESTAMPTZ(3),
ADD COLUMN "ultimo_lembrete_repetido_enviado_em" TIMESTAMPTZ(3),
ADD COLUMN "ultimo_lembrete_semanal_enviado_em" TIMESTAMPTZ(3);

-- AlterTable: SessaoTreino
ALTER TABLE "sessao_treino"
ADD COLUMN "pergunta_refazer_exibida" BOOLEAN NOT NULL DEFAULT false;
