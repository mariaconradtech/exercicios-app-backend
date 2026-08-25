import { Router } from 'express';

import { prisma } from '../prismaClient';

export const treinosRouter = Router();

treinosRouter.get('/:treinoId/execucao', async (req, res) => {
  try {
    const treinoId = Number(req.params.treinoId);

    const treino = await prisma.treino.findUnique({
      where: { id: treinoId },
      include: {
        exercicios: {
          include: { exercicio: true },
          orderBy: { ordem: 'asc' },
        },
      },
    });

    if (!treino) {
      res.status(404).json({ error: 'Treino não encontrado' });
      return;
    }

    res.json({
      id: treino.id,
      nome: treino.nome,
      fase: treino.fase,
      nivel: treino.nivel,
      itens: treino.exercicios.map((te) => ({
        exercicioId: te.exercicioId,
        ordem: te.ordem,
        series: te.series,
        descansoSegundos: te.descansoSegundos,
        duracaoEstimadaSegundos: te.duracaoEstimadaSegundos,
        exercicio: {
          id: te.exercicio.id,
          nome: te.exercicio.nome,
          videoUrl: te.exercicio.videoUrl,
          instrucao: te.exercicio.instrucao,
        },
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
