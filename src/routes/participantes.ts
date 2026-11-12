import { Router } from 'express';

import { exigirAdmin } from '../middlewares/exigirAdmin';
import { prisma } from '../prismaClient';
import { FaseTreino, GeneroAvatar, Prisma, Sexo, StatusSessao, TipoUsuario } from '../../generated/prisma/client';
import { cpfValido } from '../utils/cpf';
import { gerarHashSenha, senhaAtendeRegra } from '../utils/senha';
import { faseParaLabel } from '../utils/treino';
import { filtroSessoesQueContam, inicioDaSemana } from '../services/gamificacao';
import { MENSAGEM_PERGUNTA_REFAZER_TREINO } from '../services/mensagens';
import { tokenPushValido } from '../services/pushNotifications';
import { objetivoPorFase, proximaFase } from './engajamento';

export const participantesRouter = Router();

/** Mesmo limite usado em src/routes/engajamento.ts (3 sessões contam por semana). */
const SESSOES_POR_SEMANA = 3;
/** Sessão interrompida com menos de 50% é considerada "pouco treino" (item 3 do doc de mensagens). */
const PERCENTUAL_MAXIMO_POUCO_TREINO = 50;

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Resumo do treino feito num dia específico — usado no card "Treino realizado" da tela Início, que só aparece quando o participante toca num dia marcado no calendário. */
interface TreinoResumoDoDia {
  nome: string;
  fase: string;
  nivel: number;
  quantidadeExercicios: number;
  duracaoMinutos: number;
}

function textoPreenchido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

/**
 * Converte "YYYY-MM-DD" (formato de <input type="date">) em Date UTC à meia-noite,
 * validando que é uma data real (não aceita "2024-02-31", por exemplo) e que não
 * está no futuro.
 */
function parseDataNascimento(valor: unknown): Date | null | undefined {
  if (typeof valor !== 'string' || !valor.trim()) {
    return undefined;
  }

  if (!FORMATO_DATA.test(valor)) {
    return null;
  }

  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const dataValida =
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;

  if (!dataValida || data.getTime() > Date.now()) {
    return null;
  }

  return data;
}

function parseSexo(valor: unknown): Sexo | null | undefined {
  if (valor === undefined || valor === null || valor === '') {
    return undefined;
  }
  if (valor === Sexo.FEMININO || valor === Sexo.MASCULINO) {
    return valor;
  }
  return null;
}

// Cadastro de participante feito pelo administrador na área web. O participante
// entra no aplicativo com o CPF e a senha definidos aqui.
participantesRouter.post('/', exigirAdmin, async (req, res) => {
  const { nome, cpf, email, senha, dataNascimento, sexo } = req.body as {
    nome?: unknown;
    cpf?: unknown;
    email?: unknown;
    senha?: unknown;
    dataNascimento?: unknown;
    sexo?: unknown;
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

  // dataNascimento e sexo são obrigatórios em cadastros novos: são os dados
  // reais usados pelo Painel do Pesquisador (idade e sexo). Participantes
  // cadastrados antes desse campo existir ficam sem o dado (null no banco).
  const dataNascimentoParseada = parseDataNascimento(dataNascimento);
  if (dataNascimentoParseada === undefined) {
    return res.status(400).json({ error: 'Data de nascimento é obrigatória' });
  }
  if (dataNascimentoParseada === null) {
    return res.status(400).json({ error: 'Informe uma data de nascimento válida e não futura' });
  }

  const sexoParseado = parseSexo(sexo);
  if (sexoParseado === undefined) {
    return res.status(400).json({ error: 'Sexo é obrigatório' });
  }
  if (sexoParseado === null) {
    return res.status(400).json({ error: 'sexo deve ser "FEMININO" ou "MASCULINO"' });
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
            dataNascimento: dataNascimentoParseada,
            sexo: sexoParseado,
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
      dataNascimento: usuario.participante!.dataNascimento,
      sexo: usuario.participante!.sexo,
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
      dataNascimento: participante.dataNascimento,
      sexo: participante.sexo,
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
    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const inicioAmanha = new Date(inicioHoje.getTime() + 24 * 60 * 60 * 1000);
    const inicioSemana = inicioDaSemana(agora);

    const [sessoesDoMes, treinosHoje, treinosNaSemana, ultimaSessaoGeral] =
      await Promise.all([
        // Traz os dados completos de cada sessão do mês (não só a data) para
        // montar `treinosPorDia`: o card "Treino realizado" só aparece quando
        // o participante toca num dia marcado no calendário, mostrando o
        // treino daquele dia específico — não mais o último treino geral.
        prisma.sessaoTreino.findMany({
          where: {
            participanteId,
            ...filtroSessoesQueContam,
            dataInicio: { gte: inicioMes, lt: inicioProximoMes },
          },
          orderBy: { dataInicio: 'asc' },
          include: {
            treino: { include: { _count: { select: { exercicios: true } } } },
          },
        }),
        prisma.sessaoTreino.count({
          where: { participanteId, ...filtroSessoesQueContam, dataInicio: { gte: inicioHoje, lt: inicioAmanha } },
        }),
        prisma.sessaoTreino.count({
          where: { participanteId, ...filtroSessoesQueContam, dataInicio: { gte: inicioSemana } },
        }),
        // Pergunta "deseja refazer esse treino?" (item 3 do doc de mensagens): só aparece
        // quando a sessão MAIS RECENTE (contando ou não) ficou entre 1% e 49% e ainda
        // não foi exibida. Se depois dela o participante já treinou de novo, não faz
        // sentido perguntar sobre uma sessão antiga.
        prisma.sessaoTreino.findFirst({
          where: { participanteId },
          orderBy: { dataInicio: 'desc' },
          select: { id: true, status: true, percentualConcluido: true, perguntaRefazerExibida: true },
        }),
      ]);

    const diasComTreino = Array.from(
      new Set(sessoesDoMes.map((sessao) => sessao.dataInicio.getDate())),
    ).sort((a, b) => a - b);

    // Um resumo por dia do mês que teve treino (chave = dia). Quando há mais
    // de uma sessão no mesmo dia, fica a mais recente (sessoesDoMes está em
    // ordem crescente de data, então a última sobrescreve as anteriores).
    const treinosPorDia: Record<number, TreinoResumoDoDia> = {};
    for (const sessao of sessoesDoMes) {
      treinosPorDia[sessao.dataInicio.getDate()] = {
        nome: sessao.treino.nome,
        fase: faseParaLabel(sessao.treino.fase),
        nivel: sessao.treino.nivel,
        quantidadeExercicios: sessao.treino._count.exercicios,
        duracaoMinutos: sessao.tempoRealizadoSegundos
          ? Math.round(sessao.tempoRealizadoSegundos / 60)
          : sessao.treino.duracaoEstimadaMinutos,
      };
    }

    const perguntaRefazer =
      ultimaSessaoGeral &&
      ultimaSessaoGeral.status === StatusSessao.INTERROMPIDA &&
      ultimaSessaoGeral.percentualConcluido > 0 &&
      ultimaSessaoGeral.percentualConcluido < PERCENTUAL_MAXIMO_POUCO_TREINO &&
      !ultimaSessaoGeral.perguntaRefazerExibida
        ? { sessaoId: ultimaSessaoGeral.id, mensagem: MENSAGEM_PERGUNTA_REFAZER_TREINO }
        : null;

    return res.json({
      participanteId,
      mes: mesQuery,
      ano: anoQuery,
      diasComTreino,
      treinosPorDia,
      treinouHoje: treinosHoje > 0,
      semanaCompleta: treinosNaSemana >= SESSOES_POR_SEMANA,
      perguntaRefazer,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

participantesRouter.patch('/:participanteId/push-token', async (req, res) => {
  const participanteId = Number(req.params.participanteId);

  if (!Number.isFinite(participanteId) || participanteId <= 0) {
    return res.status(400).json({ error: 'participanteId inválido' });
  }

  const { expoPushToken } = req.body as { expoPushToken?: string | null };

  if (expoPushToken !== null && !tokenPushValido(expoPushToken)) {
    return res.status(400).json({ error: 'expoPushToken inválido. Envie null para remover o token.' });
  }

  try {
    const participanteExiste = await prisma.participante.findUnique({
      where: { id: participanteId },
      select: { id: true },
    });

    if (!participanteExiste) {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }

    await prisma.participante.update({
      where: { id: participanteId },
      data: { expoPushToken: expoPushToken ?? null },
    });

    return res.status(204).end();
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
