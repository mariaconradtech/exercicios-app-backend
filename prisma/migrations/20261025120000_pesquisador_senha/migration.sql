-- Senha (hash scrypt) usada no login do pesquisador na área web. Opcional para
-- não quebrar pesquisadores já cadastrados, que definem uma pela tela "Esqueci minha senha".
ALTER TABLE "pesquisador" ADD COLUMN "senha" TEXT;
