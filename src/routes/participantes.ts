import { Router } from 'express';

import { prisma } from '../prismaClient';
import { GeneroAvatar, Prisma } from '../../generated/prisma/client';

export const participantesRouter = Router();

participantesRouter.patch('/:participanteId/avatar', async (req, res) => {
  const participanteId = Number(req.params.participanteId);

  if (!Number.isFinite(participanteId) || participanteId <= 0) {
    return res.status(400).json({ error: 'participanteId inválido' });
  }

  const { avatarGenero, avatarPersonagem } = req.body as {
    avatarGenero?: string;
    avatarPersonagem?: string;
  };

  if (avatarGenero !== 'FEMININO' && avatarGenero !== 'MASCULINO') {
    return res
      .status(400)
      .json({ error: 'avatarGenero deve ser "FEMININO" ou "MASCULINO"' });
  }

  const personagem =
    typeof avatarPersonagem === 'string' && avatarPersonagem.trim().length > 0
      ? avatarPersonagem.trim()
      : avatarGenero === 'FEMININO'
      ? 'padrao-feminino'
      : 'padrao-masculino';

  try {
    const perfil = await prisma.perfilGamificado.upsert({
      where: { participanteId },
      update: {
        avatarGenero: avatarGenero as GeneroAvatar,
        avatarPersonagem: personagem,
      },
      create: {
        participanteId,
        avatarGenero: avatarGenero as GeneroAvatar,
        avatarPersonagem: personagem,
      },
    });

    return res.status(200).json({
      participanteId: perfil.participanteId,
      avatarGenero: perfil.avatarGenero,
      avatarPersonagem: perfil.avatarPersonagem,
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
