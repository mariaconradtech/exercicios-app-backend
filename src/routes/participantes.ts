import { Router } from 'express';

import { exigirAdmin } from '../middlewares/exigirAdmin';
import { prisma } from '../prismaClient';
import { FaseTreino, GeneroAvatar, Prisma, TipoUsuario } from '../../generated/prisma/client';
import { cpfValido } from '../utils/cpf';
import { gerarHashSenha, senhaAtendeRegra } from '../utils/senha';
import { faseParaLabel } from '../utils/treino';
import { filtroSessoesQueContam } from '../services/gamificacao';
import { objetivoPorFase, proximaFase } from './engajamento';

export const participantesRouter = Router();

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function textoPreenchido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

// Cadastro de participante feito pelo administrador na área web. O participante
// entra no aplicativo com o CPF e a senha definidos aqui.
participantesRouter.post('/', exigirAdmin, async (req, res) => {
  const { nome, cpf, email, senha } = req.body as {
    nome?: unknown;
    cpf?: unknown;
    email?: unknown;
    senha?: unknown;
  };

  if (!textoPreenchido(nome)) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  // O nome aparece na saudação do app; evita gravar o email no lugar dele.
  if (nome.includes('@')) {
    return res.status(400).json({ error: 'Informe o nome do participante, não o email' });
  }

  if (!textoPreenchido(cpf) || !cpfValido(cpf)) {
    return res.status(400).json({ error: 'Informe um CPF válido' });
  }

  if (!textoPreenchido(email) || !FORMATO_EMAIL.test(email.trim())) {
    return res.status(400).json({ error: 'Informe um email válido' });
  }

  if (!textoPreenchido(senha)) {
    return res.status(400).json({ error: 'Senha é obrigatória' });
  }

  if (!senhaAtendeRegra(senha)) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres, com letras e números' });
  }

  const cpfNormalizado = cpf.replace(/\D/g, '');
  const emailNormalizado = email.trim().toLowerCase();

  try {
    const [cpfEmUso, emailEmUso] = await Promise.all([
      prisma.participante.findUnique({ where: { cpf: cpfNormalizado }, select: { id: true } }),
      prisma.usuario.findFirst({
        where: { email: { equals: emailNormalizado, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);

    if (cpfEmUso) {
      return res.status(409).json({ error: 'Já existe um participante cadastrado com este CPF' });
    }
    if (emailEmUso) {
      return res.status(409).json({ error: 'Já existe um usuário cadastrado com este email' });
    }

    const usuario = await prisma.usuario.create({
      data: {
        nome: nome.trim(),
        email: emailNormalizado,
        tipo: TipoUsuario.PARTICIPANTE,
        participante: {
          create: {
            cpf: cpfNormalizado,
            senha: await gerarHashSenha(senha),
          },
        },
      },
      include: { participante: true },
    });

    return res.status(201).json({
      participanteId: usuario.participante!.id,
      usuarioId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      cpf: usuario.participante!.cpf,
      dataAdesao: usuario.participante!.dataAdesao,
    });
  } catch (error) {
    // Corrida entre a verificação acima e o insert: outro cadastro usou o mesmo dado.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'CPF ou email já cadastrado' });
    }
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

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
        sessoes: { where: filtroSessoesQueContam },
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

participantesRouter.get('/:participanteId/inicio', async (req, res) => {
  const participanteId = Number(req.params.participanteId);

  if (!Number.isFinite(participanteId) || participanteId <= 0) {
    return res.status(400).json({ error: 'participanteId inválido' });
  }

  const agora = new Date();
  const mesQuery = req.query.mes !== undefined ? Number(req.query.mes) : agora.getMonth() + 1;
  const anoQuery = req.query.ano !== undefined ? Number(req.query.ano) : agora.getFullYear();

  if (!Number.isInteger(mesQuery) || mesQuery < 1 || mesQuery > 12) {
    return res.status(400).json({ error: "O parâmetro 'mes' deve ser um número inteiro entre 1 e 12." });
  }

  if (!Number.isInteger(anoQuery) || anoQuery < 1970) {
    return res.status(400).json({ error: "O parâmetro 'ano' deve ser um número inteiro válido." });
  }

  try {
    const participanteExiste = await prisma.participante.findUnique({
      where: { id: participanteId },
      select: { id: true },
    });

    if (!participanteExiste) {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }

    const inicioMes = new Date(anoQuery, mesQuery - 1, 1);
    const inicioProximoMes = new Date(anoQuery, mesQuery, 1);

    const [sessoesDoMes, ultimaSessaoConcluida] = await Promise.all([
      prisma.sessaoTreino.findMany({
        where: {
          participanteId,
          ...filtroSessoesQueContam,
          dataInicio: { gte: inicioMes, lt: inicioProximoMes },
        },
        select: { dataInicio: true },
      }),
      prisma.sessaoTreino.findFirst({
        where: { participanteId, ...filtroSessoesQueContam },
        orderBy: { dataInicio: 'desc' },
        include: {
          treino: { include: { _count: { select: { exercicios: true } } } },
        },
      }),
    ]);

    const diasComTreino = Array.from(
      new Set(sessoesDoMes.map((sessao) => sessao.dataInicio.getDate())),
    ).sort((a, b) => a - b);

    const treinoRealizado = ultimaSessaoConcluida
      ? {
          nome: ultimaSessaoConcluida.treino.nome,
          fase: faseParaLabel(ultimaSessaoConcluida.treino.fase),
          nivel: ultimaSessaoConcluida.treino.nivel,
          quantidadeExercicios: ultimaSessaoConcluida.treino._count.exercicios,
          duracaoMinutos: ultimaSessaoConcluida.tempoRealizadoSegundos
            ? Math.round(ultimaSessaoConcluida.tempoRealizadoSegundos / 60)
            : ultimaSessaoConcluida.treino.duracaoEstimadaMinutos,
        }
      : null;

    return res.json({
      participanteId,
      mes: mesQuery,
      ano: anoQuery,
      diasComTreino,
      treinoRealizado,
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
