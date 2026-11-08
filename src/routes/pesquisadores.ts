import { Router } from 'express';

import { prisma } from '../prismaClient';
import { TipoUsuario } from '../../generated/prisma/client';
import { gerarHashSenha, senhaAtendeRegra } from '../utils/senha';

export const pesquisadoresRouter = Router();

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function textoPreenchido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

// Cadastro de pesquisador feito pelo administrador na área web.
pesquisadoresRouter.post('/', async (req, res) => {
  const { nome, email, universidade, senha } = req.body as {
    nome?: unknown;
    email?: unknown;
    universidade?: unknown;
    senha?: unknown;
  };

  if (!textoPreenchido(nome)) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  if (!textoPreenchido(email) || !FORMATO_EMAIL.test(email.trim())) {
    return res.status(400).json({ error: 'Informe um email válido' });
  }

  if (!textoPreenchido(universidade)) {
    return res.status(400).json({ error: 'Universidade é obrigatória' });
  }

  if (!textoPreenchido(senha)) {
    return res.status(400).json({ error: 'Senha é obrigatória' });
  }

  if (!senhaAtendeRegra(senha)) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres, com letras e números' });
  }

  try {
    const emailNormalizado = email.trim().toLowerCase();

    const emailEmUso = await prisma.usuario.findFirst({
      where: { email: { equals: emailNormalizado, mode: 'insensitive' } },
    });

    if (emailEmUso) {
      return res.status(409).json({ error: 'Já existe um usuário cadastrado com este email' });
    }

    const usuario = await prisma.usuario.create({
      data: {
        nome: nome.trim(),
        email: emailNormalizado,
        tipo: TipoUsuario.PESQUISADOR,
        pesquisador: {
          create: {
            universidade: universidade.trim(),
            senha: await gerarHashSenha(senha),
          },
        },
      },
      include: { pesquisador: true },
    });

    return res.status(201).json({
      pesquisadorId: usuario.pesquisador!.id,
      usuarioId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      universidade: usuario.pesquisador!.universidade,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
