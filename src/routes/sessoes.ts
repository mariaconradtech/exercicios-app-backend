import { Router } from 'express';

import { prisma } from '../prismaClient';
import { StatusSessao } from '../../generated/prisma/client';

export const sessoesRouter = Router();

sessoesRouter.post('/', async (req, res) => {
  try {
    const { treinoId, participanteId } = req.body as { treinoId: number; participanteId: number };

    const sessao = await prisma.sessaoTreino.create({
      data: {
        treinoId,
        participanteId,
        status: StatusSessao.EM_ANDAMENTO,
      },
    });

    res.status(201).json({ sessaoId: sessao.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

sessoesRouter.patch('/:sessaoId/progresso', async (req, res) => {
  try {
    const sessaoId = Number(req.params.sessaoId);
    const { exercicioId, serie } = req.body as { exercicioId: number; serie: number };

    const sessao = await prisma.sessaoTreino.findUnique({ where: { id: sessaoId } });
    if (!sessao) {
      res.status(404).json({ error: 'Sessão não encontrada' });
      return;
    }

    const treinoExercicio = await prisma.treinoExercicio.findUnique({
      where: { treinoId_exercicioId: { treinoId: sessao.treinoId, exercicioId } },
    });
    if (!treinoExercicio) {
      res.status(404).json({ error: 'Exercício não pertence a esse treino' });
      return;
    }

    const existente = await prisma.sessaoExercicio.findUnique({
      where: { sessaoId_exercicioId: { sessaoId, exercicioId } },
    });
    const seriesConcluidas = Math.max(existente?.seriesConcluidas ?? 0, serie);
    const concluido = seriesConcluidas >= treinoExercicio.series;

    await prisma.sessaoExercicio.upsert({
      where: { sessaoId_exercicioId: { sessaoId, exercicioId } },
      create: { sessaoId, exercicioId, seriesConcluidas, concluido },
      update: { seriesConcluidas, concluido },
    });

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

sessoesRouter.patch('/:sessaoId/finalizar', async (req, res) => {
  try {
    const sessaoId = Number(req.params.sessaoId);
    const { status, tempoRealizadoSegundos, percentualConcluido } = req.body as {
      status: 'CONCLUIDA' | 'INTERROMPIDA';
      tempoRealizadoSegundos: number;
      percentualConcluido: number;
    };

    if (status !== 'CONCLUIDA' && status !== 'INTERROMPIDA') {
      res.status(400).json({ error: 'status inválido' });
      return;
    }

    await prisma.sessaoTreino.update({
      where: { id: sessaoId },
      data: {
        status: status === 'CONCLUIDA' ? StatusSessao.CONCLUIDA : StatusSessao.INTERROMPIDA,
        tempoRealizadoSegundos,
        percentualConcluido,
        dataFim: new Date(),
      },
    });

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
