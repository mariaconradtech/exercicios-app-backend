import { Router } from 'express';

import { prisma } from '../prismaClient';
import { FaseTreino, GeneroAvatar, Prisma, StatusSessao } from '../../generated/prisma/client';
import { faseParaLabel } from '../utils/treino';
import { objetivoPorFase, proximaFase } from './engajamento';

export const participantesRouter = Router();

participantesRouter.get('/:participanteId/perfil', async (req, res) => {
  const participanteId = Number(req.params.participanteId);

  if (!Number.isFinite(participanteId) || participanteId <= 0) {
    return res.status(400).json({ error: 'participanteId inválido' });
  }

  try {
    const participante = await prisma.participante.findUnique({
      where: { id: participanteId },
      include: {
        usuario: true,
        perfil: true,
        sessoes: { where: { status: StatusSessao.CONCLUIDA } },
      },
    });

    if (!participante) {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }

    const faseAtual = participante.perfil?.faseAtual ?? FaseTreino.INICIANTE;
    const totalTreinosConcluidos = participante.sessoes.length;
    const objetivoFase = objetivoPorFase(faseAtual);
    const proxFase = proximaFase(faseAtual);

    return res.json({
      participanteId: participante.id,
      nome: participante.usuario.nome,
      cpf: participante.cpf,
      dataAdesao: participante.dataAdesao,
      categoria: faseParaLabel(faseAtual),
      pontos: participante.perfil?.pontos ?? 0,
      totalTreinosConcluidos,
      avatarGenero: participante.perfil?.avatarGenero ?? null,
      nomeAvatar: participante.perfil?.nomeAvatar ?? null,
      proximoNivel: {
        nivelAtual: faseParaLabel(faseAtual),
        proximoNivel: proxFase ? faseParaLabel(proxFase) : null,
        treinosFaltantes: Math.max(0, objetivoFase - totalTreinosConcluidos),
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

participantesRouter.patch('/:participanteId/avatar', async (req, res) => {
  const participanteId = Number(req.params.participanteId);

  if (!Number.isFinite(participanteId) || participanteId <= 0) {
    return res.status(400).json({ error: 'participanteId inválido' });
  }

  const { avatarGenero, nomeAvatar } = req.body as {
    avatarGenero?: string;
    nomeAvatar?: string;
  };

  if (avatarGenero !== 'FEMININO' && avatarGenero !== 'MASCULINO') {
    return res
      .status(400)
      .json({ error: 'avatarGenero deve ser "FEMININO" ou "MASCULINO"' });
  }

  const nomeFinal = typeof nomeAvatar === 'string' ? nomeAvatar.trim() || null : null;

  try {
    const perfil = await prisma.perfilGamificado.upsert({
      where: { participanteId },
      update: {
        avatarGenero: avatarGenero as GeneroAvatar,
        nomeAvatar: nomeFinal,
      },
      create: {
        participanteId,
        avatarGenero: avatarGenero as GeneroAvatar,
        nomeAvatar: nomeFinal,
      },
    });

    return res.status(200).json({
      participanteId: perfil.participanteId,
      avatarGenero: perfil.avatarGenero,
      nomeAvatar: perfil.nomeAvatar,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
