import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma, StatusSessao } from '../generated/prisma/client';

import { sessoesRouter } from './routes/sessoes';
import { treinosRouter } from './routes/treinos';
import { participantesRouter } from './routes/participantes';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const app = express();
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/treinos', treinosRouter);
app.use('/sessoes', sessoesRouter);
app.use('/participantes', participantesRouter);

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

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
