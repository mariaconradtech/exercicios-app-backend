process.env.TZ = process.env.TZ ?? 'America/Sao_Paulo';

import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { prisma } from './src/prismaClient';
import { autenticacaoRouter } from './src/routes/autenticacao';
import { participantesRouter } from './src/routes/participantes';
import { treinosRouter } from './src/routes/treinos';
import { sessoesRouter } from './src/routes/sessoes';
import { StatusSessao } from './generated/prisma/client';
import { recalcularGamificacaoParticipante } from './src/services/gamificacao';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use(autenticacaoRouter);
app.use('/participantes', participantesRouter);
app.use('/treinos', treinosRouter);
app.use('/sessoes', sessoesRouter);

app.post('/avaliacoes', async (req, res) => {
  try {
    const { rating, sessaoId, sessionId } = req.body as {
      rating?: unknown;
      sessaoId?: unknown;
      sessionId?: unknown;
    };

    const parseInteger = (value: unknown) => {
      const numericValue = typeof value === 'string' ? Number(value) : value;
      return typeof numericValue === 'number' && Number.isInteger(numericValue) ? numericValue : null;
    };

    const ratingNum = parseInteger(rating);

    if (ratingNum === null || ratingNum < 0 || ratingNum > 10) {
      return res
        .status(400)
        .json({ error: 'A nota do feedback deve ser um numero inteiro entre 0 e 10.' });
    }

    const sessaoIdNum = parseInteger(sessaoId ?? sessionId);

    if (sessaoIdNum === null || sessaoIdNum <= 0) {
      return res.status(400).json({
        error: 'sessaoId e obrigatorio e deve ser um numero inteiro positivo.',
      });
    }

    const sessao = await prisma.sessaoTreino.findUnique({ where: { id: sessaoIdNum } });
    if (!sessao) {
      return res.status(404).json({ error: 'Sessao nao encontrada.' });
    }

    const gamificacao = await prisma.$transaction(async (tx) => {
      const statusFinal =
        sessao.status === StatusSessao.INTERROMPIDA ? StatusSessao.INTERROMPIDA : StatusSessao.CONCLUIDA;

      await tx.sessaoTreino.update({
        where: { id: sessao.id },
        data: {
          esforcoOmni: ratingNum,
          status: statusFinal,
          dataFim: sessao.dataFim ?? new Date(),
          ...(statusFinal === StatusSessao.CONCLUIDA && sessao.percentualConcluido < 100
            ? { percentualConcluido: 100 }
            : {}),
        },
      });

      return recalcularGamificacaoParticipante(tx, sessao.participanteId);
    });

    res.status(200).json({
      message: 'Feedback salvo com sucesso.',
      gamificacao: {
        faseAtual: gamificacao.faseAtual,
        nivelAtual: gamificacao.nivelAtual,
        pontos: gamificacao.pontos,
        estrelas: gamificacao.estrelas,
        medalhas: gamificacao.medalhas,
        trofeus: gamificacao.trofeus,
        pontosGanhosSessao: gamificacao.pontosPorSessao.get(sessao.id) ?? 0,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao salvar feedback.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`API rodando em http://localhost:${port}`);
});