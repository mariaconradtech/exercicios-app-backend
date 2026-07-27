import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma, StatusSessao } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const app = express();
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/treinos/:treinoId/execucao', async (req, res) => {
  const treinoId = Number(req.params.treinoId);
  if (Number.isNaN(treinoId)) {
    return res.status(400).json({ error: 'treinoId inválido' });
  }

  const treino = await prisma.treino.findUnique({
    where: { id: treinoId },
    include: {
      exercicios: {
        orderBy: { ordem: 'asc' },
        include: { exercicio: true },
      },
    },
  });

  if (!treino) {
    return res.status(404).json({ error: 'Treino não encontrado' });
  }

  return res.json({
    id: treino.id,
    nome: treino.nome,
    itens: treino.exercicios.map((item) => ({
      exercicioId: item.exercicioId,
      ordem: item.ordem,
      series: item.series,
      descansoSegundos: item.descansoSegundos,
      duracaoEstimadaSegundos: item.duracaoEstimadaSegundos,
      exercicio: {
        id: item.exercicio.id,
        nome: item.exercicio.nome,
        videoUrl: item.exercicio.videoUrl,
        instrucao: item.exercicio.instrucao,
      },
    })),
  });
});

app.post('/sessoes', async (req, res) => {
  const { treinoId, participanteId } = req.body;
  if (typeof treinoId !== 'number' || typeof participanteId !== 'number') {
    return res.status(400).json({ error: 'treinoId e participanteId são obrigatórios' });
  }

  const sessao = await prisma.sessaoTreino.create({
    data: {
      treinoId,
      participanteId,
      status: StatusSessao.EM_ANDAMENTO,
    },
  });

  return res.status(201).json({ sessaoId: sessao.id });
});

app.patch('/sessoes/:sessaoId/progresso', async (req, res) => {
  const sessaoId = Number(req.params.sessaoId);
  if (Number.isNaN(sessaoId)) {
    return res.status(400).json({ error: 'sessaoId inválido' });
  }

  return res.status(204).send();
});

app.patch('/sessoes/:sessaoId/finalizar', async (req, res) => {
  const sessaoId = Number(req.params.sessaoId);
  const { status, tempoRealizadoSegundos, percentualConcluido, esforcoOmni } = req.body;

  if (Number.isNaN(sessaoId)) {
    return res.status(400).json({ error: 'sessaoId inválido' });
  }

  if (status !== 'CONCLUIDA' && status !== 'INTERROMPIDA') {
    return res.status(400).json({ error: 'status inválido' });
  }

  if (esforcoOmni !== undefined && typeof esforcoOmni !== 'number') {
    return res.status(400).json({ error: 'esforcoOmni deve ser um número' });
  }

  try {
    await prisma.sessaoTreino.update({
      where: { id: sessaoId },
      data: {
        status: status === 'CONCLUIDA' ? StatusSessao.CONCLUIDA : StatusSessao.INTERROMPIDA,
        tempoRealizadoSegundos,
        percentualConcluido,
        dataFim: new Date(),
        ...(typeof esforcoOmni === 'number' ? { esforcoOmni } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    throw error;
  }

  return res.status(204).send();
});

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

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  // Server started
});
