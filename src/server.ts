import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma, StatusSessao } from '../generated/prisma/client';

import { autenticacaoRouter } from './routes/autenticacao';
import { participantesRouter } from './routes/participantes';
import { categoriasRouter } from './routes/categorias';
import { sessoesRouter } from './routes/sessoes';
import { treinosRouter } from './routes/treinos';
import { engajamentoRouter } from './routes/engajamento';
import { exerciciosRouter } from './routes/exercicios';
import { recalcularGamificacaoParticipante } from './services/gamificacao';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const app = express();
const prisma = new PrismaClient({ adapter });

const origensPermitidas = [
  'http://localhost:5173',
  'http://localhost:8081',
  'http://192.168.0.107:8081',
  ...(process.env.FRONTEND_URL_PRODUCAO ? [process.env.FRONTEND_URL_PRODUCAO] : []),
];

app.use(
  cors({
    origin: origensPermitidas,
  }),
);
app.use(express.json());
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(autenticacaoRouter);
app.use('/participantes', participantesRouter);
app.use('/treinos', treinosRouter);
app.use('/sessoes', sessoesRouter);
app.use('/categorias', categoriasRouter);
app.use('/engajamento', engajamentoRouter);
app.use('/exercicios', exerciciosRouter);

app.post('/avaliacoes', async (req, res) => {
  const { sessaoId, rating } = req.body as { sessaoId?: unknown; rating?: unknown };
  const sessaoIdNumerico = typeof sessaoId === 'string' ? Number(sessaoId) : sessaoId;
  const ratingNumerico = typeof rating === 'string' ? Number(rating) : rating;

  if (
    typeof sessaoIdNumerico !== 'number' ||
    !Number.isInteger(sessaoIdNumerico) ||
    sessaoIdNumerico <= 0
  ) {
    return res.status(400).json({ error: 'sessaoId é obrigatório e deve ser um número inteiro positivo' });
  }

  if (
    typeof ratingNumerico !== 'number' ||
    !Number.isInteger(ratingNumerico) ||
    ratingNumerico < 0 ||
    ratingNumerico > 10
  ) {
    return res.status(400).json({ error: 'rating deve ser um número inteiro entre 0 e 10' });
  }

  try {
    const sessao = await prisma.sessaoTreino.findUnique({
      where: { id: sessaoIdNumerico },
    });

    if (!sessao) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const gamificacao = await prisma.$transaction(async (tx) => {
      const statusFinal =
        sessao.status === StatusSessao.INTERROMPIDA ? StatusSessao.INTERROMPIDA : StatusSessao.CONCLUIDA;

      await tx.sessaoTreino.update({
        where: { id: sessaoIdNumerico },
        data: {
          esforcoOmni: ratingNumerico,
          status: statusFinal,
          dataFim: sessao.dataFim ?? new Date(),
          ...(statusFinal === StatusSessao.CONCLUIDA && sessao.percentualConcluido < 100
            ? { percentualConcluido: 100 }
            : {}),
        },
      });

      return recalcularGamificacaoParticipante(tx, sessao.participanteId);
    });

    return res.status(200).json({
      message: 'Avaliação salva com sucesso',
      gamificacao: {
        faseAtual: gamificacao.faseAtual,
        nivelAtual: gamificacao.nivelAtual,
        pontos: gamificacao.pontos,
        estrelas: gamificacao.estrelas,
        medalhas: gamificacao.medalhas,
        trofeus: gamificacao.trofeus,
        pontosGanhosSessao: gamificacao.pontosPorSessao.get(sessaoIdNumerico) ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    throw error;
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao processar a requisição' });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
