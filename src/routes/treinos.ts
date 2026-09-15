import { Router, type Response } from 'express';

import { prisma } from '../prismaClient';
import { Prisma, FaseTreino } from '../../generated/prisma/client';
import { calcularDuracaoEstimadaMinutos, faseParaLabel, labelParaFase, NIVEIS_VALIDOS } from '../utils/treino';

export const treinosRouter = Router();

treinosRouter.get('/participante/:participanteId/ativo', async (req, res) => {
  try {
    const participanteId = Number(req.params.participanteId);

    if (!Number.isInteger(participanteId) || participanteId <= 0) {
      res.status(400).json({ error: 'participanteId inválido' });
      return;
    }

    const participante = await prisma.participante.findUnique({
      where: { id: participanteId },
      include: { perfil: true },
    });

    if (!participante) {
      res.status(404).json({ error: 'Participante não encontrado' });
      return;
    }

    const treino = await prisma.treino.findFirst({
      where: {
        ativo: true,
        fase: participante.perfil?.faseAtual ?? FaseTreino.INICIANTE,
      },
      include: {
        exercicios: {
          include: { exercicio: true },
          orderBy: { ordem: 'asc' },
        },
      },
      orderBy: { nivel: 'asc' },
    });

    if (!treino) {
      res.status(404).json({ error: 'Nenhum treino ativo encontrado para a fase do participante' });
      return;
    }

    res.json({
      id: treino.id,
      nome: treino.nome,
      descricao: treino.descricao,
      fase: treino.fase,
      nivel: treino.nivel,
      itens: treino.exercicios.map((te, index) => ({
        exercicioId: te.exercicioId,
        ordem: index + 1,
        series: te.series,
        descansoSegundos: te.descansoSegundos,
        multiplicadorVelocidade: te.multiplicadorVelocidade,
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
      descricao: treino.descricao,
      fase: treino.fase,
      nivel: treino.nivel,
      itens: treino.exercicios.map((te, index) => ({
        exercicioId: te.exercicioId,
        ordem: index + 1,
        series: te.series,
        descansoSegundos: te.descansoSegundos,
        multiplicadorVelocidade: te.multiplicadorVelocidade,
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

// ==========================================
// CRUD de Treinos (protocolos de treino)
// ==========================================

type ItemTreinoExercicioEntrada = {
  exercicioId: number;
  series: number;
  descansoSegundos: number;
  multiplicadorVelocidade: number;
};

type TreinoEntradaValidada = {
  nome: string;
  descricao: string;
  fase: FaseTreino;
  nivel: number;
  quantidadeSemanas: number;
  descansoEntreSeriesSegundos: number;
  exercicios: ItemTreinoExercicioEntrada[];
};

type TreinoComExercicios = Prisma.TreinoGetPayload<{ include: { exercicios: true } }>;

function enviarErro(res: Response, status: number, mensagem: string) {
  res.status(status).json({ error: mensagem });
}

function ehInteiro(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && Number.isInteger(valor);
}

function ehNumeroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0;
}

function validarRequisicaoTreino(body: unknown): { dados: TreinoEntradaValidada } | { erro: string } {
  if (typeof body !== 'object' || body === null) {
    return { erro: 'Corpo da requisição inválido.' };
  }

  const { nome, descricao, fase, nivel, quantidadeSemanas, descansoEntreSeriesSegundos, exercicios } =
    body as Record<string, unknown>;

  if (typeof nome !== 'string' || !nome.trim()) {
    return { erro: "O campo 'nome' é obrigatório." };
  }

  if (typeof descricao !== 'string' || !descricao.trim()) {
    return { erro: "O campo 'descricao' é obrigatório." };
  }

  if (typeof fase !== 'string' || !fase.trim()) {
    return { erro: "O campo 'fase' é obrigatório." };
  }

  const faseEnum = labelParaFase(fase);
  if (!faseEnum) {
    return { erro: "O campo 'fase' deve ser um dos valores: Iniciante, Intermediário, Avançado." };
  }

  if (!ehInteiro(nivel) || !NIVEIS_VALIDOS.includes(nivel as 1 | 2)) {
    return { erro: "O campo 'nivel' é obrigatório e deve ser 1 ou 2." };
  }

  if (!ehInteiro(quantidadeSemanas) || quantidadeSemanas <= 0) {
    return { erro: "O campo 'quantidadeSemanas' é obrigatório e deve ser um número inteiro maior que zero." };
  }

  if (!ehInteiro(descansoEntreSeriesSegundos) || descansoEntreSeriesSegundos < 0) {
    return {
      erro: "O campo 'descansoEntreSeriesSegundos' é obrigatório e deve ser um número inteiro maior ou igual a zero.",
    };
  }

  if (!Array.isArray(exercicios) || exercicios.length < 1) {
    return { erro: "O treino deve ter ao menos 1 exercício em 'exercicios'." };
  }

  const itensValidados: ItemTreinoExercicioEntrada[] = [];
  const idsVistos = new Set<number>();

  for (let indice = 0; indice < exercicios.length; indice += 1) {
    const item = exercicios[indice];
    if (typeof item !== 'object' || item === null) {
      return { erro: `O exercício na posição ${indice} de 'exercicios' é inválido.` };
    }

    const { exercicioId, series, descansoSegundos, multiplicadorVelocidade } = item as Record<string, unknown>;

    if (!ehInteiro(exercicioId)) {
      return { erro: `O campo 'exercicioId' do exercício na posição ${indice} é obrigatório e deve ser um número inteiro.` };
    }

    if (!ehInteiro(series) || series <= 0) {
      return {
        erro: `O campo 'series' do exercício na posição ${indice} é obrigatório e deve ser um número inteiro maior que zero.`,
      };
    }

    if (!ehInteiro(descansoSegundos) || descansoSegundos < 0) {
      return {
        erro: `O campo 'descansoSegundos' do exercício na posição ${indice} é obrigatório e deve ser um número inteiro maior ou igual a zero.`,
      };
    }

    if (!ehNumeroPositivo(multiplicadorVelocidade)) {
      return {
        erro: `O campo 'multiplicadorVelocidade' do exercício na posição ${indice} é obrigatório e deve ser um número maior que zero.`,
      };
    }

    if (idsVistos.has(exercicioId)) {
      return { erro: `O exercício com id ${exercicioId} está duplicado na lista de 'exercicios'.` };
    }
    idsVistos.add(exercicioId);

    itensValidados.push({ exercicioId, series, descansoSegundos, multiplicadorVelocidade });
  }

  return {
    dados: {
      nome: nome.trim(),
      descricao: descricao.trim(),
      fase: faseEnum,
      nivel,
      quantidadeSemanas,
      descansoEntreSeriesSegundos,
      exercicios: itensValidados,
    },
  };
}

async function buscarExercicioIdsInexistentes(exercicioIds: number[]): Promise<number[]> {
  const encontrados = await prisma.exercicio.findMany({
    where: { id: { in: exercicioIds } },
    select: { id: true },
  });
  const encontradosSet = new Set(encontrados.map((exercicio) => exercicio.id));
  return exercicioIds.filter((id) => !encontradosSet.has(id));
}

function formatarTreinoDetalhado(treino: TreinoComExercicios) {
  return {
    id: treino.id,
    nome: treino.nome,
    descricao: treino.descricao,
    fase: faseParaLabel(treino.fase),
    nivel: treino.nivel,
    quantidadeSemanas: treino.quantidadeSemanas,
    descansoEntreSeriesSegundos: treino.descansoEntreSeriesSegundos,
    duracaoEstimadaMinutos: treino.duracaoEstimadaMinutos,
    exercicios: treino.exercicios.map((item) => ({
      exercicioId: item.exercicioId,
      series: item.series,
      descansoSegundos: item.descansoSegundos,
      multiplicadorVelocidade: item.multiplicadorVelocidade,
    })),
  };
}

function parseIdParam(valor: string): number | null {
  const id = Number(valor);
  return Number.isInteger(id) ? id : null;
}

treinosRouter.get('/', async (req, res) => {
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : undefined;
    const faseQuery = typeof req.query.fase === 'string' ? req.query.fase.trim() : undefined;

    let faseEnum: FaseTreino | undefined;
    if (faseQuery) {
      const faseEncontrada = labelParaFase(faseQuery);
      if (!faseEncontrada) {
        enviarErro(res, 400, "O parâmetro 'fase' deve ser um dos valores: Iniciante, Intermediário, Avançado.");
        return;
      }
      faseEnum = faseEncontrada;
    }

    const treinos = await prisma.treino.findMany({
      where: {
        nome: busca ? { contains: busca, mode: 'insensitive' } : undefined,
        fase: faseEnum,
      },
      include: { _count: { select: { exercicios: true } } },
      orderBy: { id: 'asc' },
    });

    res.json(
      treinos.map((treino) => ({
        id: treino.id,
        nome: treino.nome,
        fase: faseParaLabel(treino.fase),
        nivel: treino.nivel,
        quantidadeSemanas: treino.quantidadeSemanas,
        duracaoEstimadaMinutos: treino.duracaoEstimadaMinutos,
        quantidadeExercicios: treino._count.exercicios,
      })),
    );
  } catch (error) {
    enviarErro(res, 500, error instanceof Error ? error.message : 'Erro inesperado ao listar os treinos.');
  }
});

treinosRouter.get('/:id', async (req, res) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      enviarErro(res, 400, "O 'id' do treino deve ser um número inteiro.");
      return;
    }

    const treino = await prisma.treino.findUnique({
      where: { id },
      include: { exercicios: { orderBy: { id: 'asc' } } },
    });

    if (!treino) {
      enviarErro(res, 404, 'Treino não encontrado.');
      return;
    }

    res.json(formatarTreinoDetalhado(treino));
  } catch (error) {
    enviarErro(res, 500, error instanceof Error ? error.message : 'Erro inesperado ao buscar o treino.');
  }
});

treinosRouter.post('/', async (req, res) => {
  try {
    const resultado = validarRequisicaoTreino(req.body);
    if ('erro' in resultado) {
      enviarErro(res, 400, resultado.erro);
      return;
    }

    const { dados } = resultado;
    const idsInexistentes = await buscarExercicioIdsInexistentes(dados.exercicios.map((item) => item.exercicioId));
    if (idsInexistentes.length > 0) {
      enviarErro(res, 404, `Exercício(s) não encontrado(s): ${idsInexistentes.join(', ')}.`);
      return;
    }

    const duracaoEstimadaMinutos = calcularDuracaoEstimadaMinutos(dados.exercicios, dados.descansoEntreSeriesSegundos);

    const treinoCriado = await prisma.treino.create({
      data: {
        nome: dados.nome,
        descricao: dados.descricao,
        fase: dados.fase,
        nivel: dados.nivel,
        quantidadeSemanas: dados.quantidadeSemanas,
        descansoEntreSeriesSegundos: dados.descansoEntreSeriesSegundos,
        duracaoEstimadaMinutos,
        exercicios: { create: dados.exercicios },
      },
      include: { exercicios: { orderBy: { id: 'asc' } } },
    });

    res.status(201).json(formatarTreinoDetalhado(treinoCriado));
  } catch (error) {
    enviarErro(res, 500, error instanceof Error ? error.message : 'Erro inesperado ao criar o treino.');
  }
});

treinosRouter.put('/:id', async (req, res) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      enviarErro(res, 400, "O 'id' do treino deve ser um número inteiro.");
      return;
    }

    const treinoExistente = await prisma.treino.findUnique({ where: { id } });
    if (!treinoExistente) {
      enviarErro(res, 404, 'Treino não encontrado.');
      return;
    }

    const resultado = validarRequisicaoTreino(req.body);
    if ('erro' in resultado) {
      enviarErro(res, 400, resultado.erro);
      return;
    }

    const { dados } = resultado;
    const idsInexistentes = await buscarExercicioIdsInexistentes(dados.exercicios.map((item) => item.exercicioId));
    if (idsInexistentes.length > 0) {
      enviarErro(res, 404, `Exercício(s) não encontrado(s): ${idsInexistentes.join(', ')}.`);
      return;
    }

    const duracaoEstimadaMinutos = calcularDuracaoEstimadaMinutos(dados.exercicios, dados.descansoEntreSeriesSegundos);

    const treinoAtualizado = await prisma.treino.update({
      where: { id },
      data: {
        nome: dados.nome,
        descricao: dados.descricao,
        fase: dados.fase,
        nivel: dados.nivel,
        quantidadeSemanas: dados.quantidadeSemanas,
        descansoEntreSeriesSegundos: dados.descansoEntreSeriesSegundos,
        duracaoEstimadaMinutos,
        exercicios: {
          deleteMany: {},
          create: dados.exercicios,
        },
      },
      include: { exercicios: { orderBy: { id: 'asc' } } },
    });

    res.json(formatarTreinoDetalhado(treinoAtualizado));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      enviarErro(res, 404, 'Treino não encontrado.');
      return;
    }
    enviarErro(res, 500, error instanceof Error ? error.message : 'Erro inesperado ao atualizar o treino.');
  }
});

treinosRouter.delete('/:id', async (req, res) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      enviarErro(res, 400, "O 'id' do treino deve ser um número inteiro.");
      return;
    }

    await prisma.treino.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        enviarErro(res, 404, 'Treino não encontrado.');
        return;
      }
      if (error.code === 'P2003') {
        enviarErro(res, 400, 'Não é possível excluir o treino pois há sessões de treino vinculadas a ele.');
        return;
      }
    }
    enviarErro(res, 500, error instanceof Error ? error.message : 'Erro inesperado ao excluir o treino.');
  }
});
