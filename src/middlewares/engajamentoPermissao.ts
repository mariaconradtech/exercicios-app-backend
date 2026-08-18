import { Request, Response, NextFunction } from 'express';

import { prisma } from '../prismaClient';
import { TipoUsuario } from '../../generated/prisma/client';

export const PERMISSAO_VISUALIZAR_ENGAJAMENTO = 'VISUALIZAR_ENGAJAMENTO';

function extrairParticipanteId(req: Request): number | null {
  const headerParticipante = req.header('x-participante-id');
  const queryParticipante = typeof req.query.participanteId === 'string' ? req.query.participanteId : null;
  const paramParticipante = typeof req.params.participanteId === 'string' ? req.params.participanteId : null;

  const valor = headerParticipante ?? queryParticipante ?? paramParticipante;
  if (!valor) {
    return null;
  }

  const parsed = Number(valor);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function validarPermissaoVisualizarEngajamento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const participanteId = extrairParticipanteId(req);

  if (!participanteId) {
    res.status(401).json({
      error: `Participante não informado. Envie x-participante-id para acessar ${PERMISSAO_VISUALIZAR_ENGAJAMENTO}.`,
    });
    return;
  }

  const participante = await prisma.participante.findUnique({
    where: { id: participanteId },
    include: { usuario: true },
  });

  if (!participante) {
    res.status(404).json({ error: 'Participante não encontrado' });
    return;
  }

  if (participante.usuario.tipo !== TipoUsuario.PARTICIPANTE) {
    res.status(403).json({ error: `Usuário sem permissão ${PERMISSAO_VISUALIZAR_ENGAJAMENTO}` });
    return;
  }

  (req as Request & { participanteId: number }).participanteId = participante.id;
  next();
}