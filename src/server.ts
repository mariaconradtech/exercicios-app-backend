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
  const { sessaoId, rating } = req.body;

  if (typeof sessaoId !== 'number' || Number.isNaN(sessaoId)) {
    return res.status(400).json({ error: 'sessaoId é obrigatório e deve ser um número' });
  }

  if (typeof rating !== 'number' || rating < 0 || rating > 10) {
    return res.status(400).json({ error: 'rating deve ser um número entre 0 e 10' });
  }

  try {
    await prisma.sessaoTreino.update({
      where: { id: sessaoId },
      data: {
        esforcoOmni: rating,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    throw error;
  }

  return res.status(200).json({ message: 'Avaliação salva com sucesso' });
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
