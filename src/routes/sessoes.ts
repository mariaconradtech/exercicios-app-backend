import { Router } from 'express';

import { prisma } from '../prismaClient';
import { StatusSessao } from '../../generated/prisma/client';
import { filtroSessoesQueContam } from '../services/gamificacao';

export const sessoesRouter = Router();

/**
 * Mensagem devolvida quando o participante tenta iniciar um 2º treino no
 * mesmo dia. Regra de negócio: só 1 treino "que conta" (ver
 * filtroSessoesQueContam) por participante por dia. O texto é o mesmo exibido
 * no card "Próximo Treino" do app quando o botão de iniciar já está desativado
 * — chega aqui só se alguém tentar contornar a tela (ex.: requisição manual).
 */
export const MENSAGEM_TREINO_JA_REALIZADO_HOJE =
  'Você já completou o treino de hoje! Parabéns pela sua dedicação e cuidado com a saúde. Descanse bem, te espero amanhã para o próximo treino!';

sessoesRouter.post('/', async (req, res) => {
  try {
    const { treinoId, participanteId } = req.body as { treinoId: number; participanteId: number };

    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const inicioAmanha = new Date(inicioHoje.getTime() + 24 * 60 * 60 * 1000);

    const jaTreinouHoje = await prisma.sessaoTreino.findFirst({
      where: {
        participanteId,
        ...filtroSessoesQueContam,
        dataInicio: { gte: inicioHoje, lt: inicioAmanha },
      },
      select: { id: true },
    });

    if (jaTreinouHoje) {
      res.status(409).json({ error: MENSAGEM_TREINO_JA_REALIZADO_HOJE });
      return;
    }

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

    const sessao = await prisma.sessaoTreino.findUnique({ where: { id: sessaoId } });
    if (!sessao) {
      res.status(404).json({ error: 'Sessão não encontrada' });
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

/**
 * Marca que a pergunta "Quando você retornar por aqui, deseja refazer esse
 * treino?" (item 3 do documento de mensagens) já foi exibida para essa sessão,
 * para não repetir em todo login — independentemente da resposta (sim ou não).
 */
sessoesRouter.patch('/:sessaoId/pergunta-refazer', async (req, res) => {
  try {
    const sessaoId = Number(req.params.sessaoId);

    if (!Number.isInteger(sessaoId) || sessaoId <= 0) {
      res.status(400).json({ error: 'sessaoId inválido' });
      return;
    }

    const sessao = await prisma.sessaoTreino.findUnique({ where: { id: sessaoId } });
    if (!sessao) {
      res.status(404).json({ error: 'Sessão não encontrada' });
      return;
    }

    await prisma.sessaoTreino.update({
      where: { id: sessaoId },
      data: { perguntaRefazerExibida: true },
    });

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
