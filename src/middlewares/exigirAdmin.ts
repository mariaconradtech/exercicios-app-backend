import { NextFunction, Request, Response } from 'express';

import { prisma } from '../prismaClient';
import { TipoUsuario } from '../../generated/prisma/client';
import { extrairTokenBearer, hashTokenSessao } from '../utils/tokenSessao';

// Libera a rota só para um administrador logado na área web. O token é o
// devolvido por POST /web/login e deve vir em `Authorization: Bearer <token>`.
export async function exigirAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extrairTokenBearer(req.header('authorization'));

  if (!token) {
    res.status(401).json({ error: 'Faça login como administrador para continuar' });
    return;
  }

  try {
    const usuario = await prisma.usuario.findFirst({
      where: { token: hashTokenSessao(token) },
      select: { id: true, tipo: true, administrador: { select: { id: true } } },
    });

    if (!usuario) {
      res.status(401).json({ error: 'Sessão expirada. Faça login novamente' });
      return;
    }

    if (usuario.tipo !== TipoUsuario.ADMIN || !usuario.administrador) {
      res.status(403).json({ error: 'Apenas administradores podem realizar esta ação' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
}
