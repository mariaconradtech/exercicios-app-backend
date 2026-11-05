import { Router } from 'express';

import { FaseTreino } from '../../generated/prisma/client';
import { prisma } from '../prismaClient';
import { validarPermissaoVisualizarEngajamento } from '../middlewares/engajamentoPermissao';
import {
  calcularSequenciaSemanasCompletas,
  filtroSessoesQueContam,
  inicioDaSemana,
} from '../services/gamificacao';

const SESSOES_POR_SEMANA = 3;
const SEMANAS_PARA_ESTRELA = 3;
const TAMANHO_TOPO_RANKING = 5;
const SESSOES_NO_GRAFICO = 10;

// Mensagens do arquivo "Mensagens para o app TecnoAging" (item 2: Ranking e progresso).
const mensagensRankingSemanaParcial = [
  'Você evoluiu mais um pouco essa semana! Parabéns!',
  'Você está evoluindo e ficando cada dia mais forte!',
  'Continue dedicado com a sua saúde e a sua vida, parabéns pelos treinos dessa semana!',
  'Fazer exercícios faz você viver melhor! Parabéns pela sua evolução!',
];

const mensagensRankingSemanaCompleta = [
  'Parabéns pela dedicação e disciplina! Você realizou as sessões de exercício da semana!',
  'Excelente trabalho! Você é muito dedicado(a) e comprometido(a) com sua saúde!',
  'Você evoluiu muito com todas as sessões de treino da semana completas! Fique orgulhoso(a)!',
  'Você leva seu compromisso com a saúde a sério! Realizou todos os treinos da semana! É um exemplo para todas as pessoas!',
  'Você é muito mais forte e mais capaz, porque realizou a semana de treinos completa! Parabéns!',
];

// precisam ser validados pela Alessandra.
const mensagensRankingSemTreino = [
  'Seu progresso continua te esperando. Realize um treino nesta semana para avançar no ranking!',
  'Cada treino ajuda você a ficar mais forte. Quando estiver pronto, acompanhe sua evolução por aqui!',
  'Você ainda pode movimentar sua semana. Faça seu próximo treino para somar pontos e cuidar da sua saúde!',
];

function escolherMensagem(mensagens: string[], seed: number): string {
  return mensagens[Math.abs(seed) % mensagens.length];
}

function mensagemRankingPorSemana(treinosSemana: number, seed: number): string {
  if (treinosSemana >= SESSOES_POR_SEMANA) {
    return escolherMensagem(mensagensRankingSemanaCompleta, seed);
  }
  if (treinosSemana >= 1) {
    return escolherMensagem(mensagensRankingSemanaParcial, seed);
  }
  return escolherMensagem(mensagensRankingSemTreino, seed);
}

function formatarDataCurta(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}

// Mantidas porque routes/participantes.ts ainda usa (tela Início).
export function objetivoPorFase(fase: FaseTreino): number {
  if (fase === FaseTreino.INICIANTE) {
    return 10;
  }
  if (fase === FaseTreino.INTERMEDIARIO) {
    return 20;
  }
  return 30;
}

export function proximaFase(fase: FaseTreino): FaseTreino | null {
  if (fase === FaseTreino.INICIANTE) {
    return FaseTreino.INTERMEDIARIO;
  }
  if (fase === FaseTreino.INTERMEDIARIO) {
    return FaseTreino.AVANCADO;
  }
  return null;
}

function faseParaLabel(fase: FaseTreino): string {
  if (fase === FaseTreino.INICIANTE) {
    return 'Iniciante';
  }
  if (fase === FaseTreino.INTERMEDIARIO) {
    return 'Intermediário';
  }
  return 'Avançado';
}

type LinhaRanking = {
  participanteId: number;
  posicao: number;
  nome: string;
  pontos: number;
  estrelas: number;
  medalhas: number;
  trofeus: number;
  ehVoce: boolean;
};

export const engajamentoRouter = Router();

engajamentoRouter.get('/', validarPermissaoVisualizarEngajamento, async (req, res) => {
  try {
    const participanteId = (req as typeof req & { participanteId: number }).participanteId;
    const agora = new Date();

    const participante = await prisma.participante.findUnique({
      where: { id: participanteId },
      include: {
        usuario: true,
        perfil: true,
        // Sessões concluídas ou interrompidas com 50% ou mais (ver filtroSessoesQueContam).
        sessoes: {
          where: filtroSessoesQueContam,
          include: { treino: { select: { fase: true, nivel: true } } },
          orderBy: { dataInicio: 'asc' },
        },
      },
    });

    if (!participante) {
      res.status(404).json({ error: 'Participante não encontrado' });
      return;
    }

    const fase = participante.perfil?.faseAtual ?? FaseTreino.INICIANTE;
    const nivelAtual = participante.perfil?.nivelAtual ?? 1;
    const sessoes = participante.sessoes;

    const inicioSemana = inicioDaSemana(agora);
    const treinosSemana = sessoes.filter((sessao) => sessao.dataInicio >= inicioSemana).length;
    const semanasSeguidas = calcularSequenciaSemanasCompletas(
      sessoes.map((sessao) => sessao.dataInicio),
      agora,
    );

    // Ranking: participantes da mesma fase.
    // Critérios do documento de gamificação: pontos → estrelas → medalhas → troféus.
    const perfisDaFase = await prisma.perfilGamificado.findMany({
      where: { faseAtual: fase },
      include: { participante: { include: { usuario: true } } },
    });

    const ordenado = perfisDaFase
      .map((perfil) => ({
        participanteId: perfil.participanteId,
        nome: perfil.nomeAvatar?.trim() || perfil.participante.usuario.nome,
        pontos: perfil.pontos,
        estrelas: perfil.estrelas,
        medalhas: perfil.medalhas,
        trofeus: perfil.trofeus,
      }))
      .sort(
        (a, b) =>
          b.pontos - a.pontos ||
          b.estrelas - a.estrelas ||
          b.medalhas - a.medalhas ||
          b.trofeus - a.trofeus ||
          a.nome.localeCompare(b.nome),
      );

    const ranking: LinhaRanking[] = ordenado.map((item, index) => ({
      ...item,
      posicao: index + 1,
      ehVoce: item.participanteId === participanteId,
    }));

    const topo = ranking.slice(0, TAMANHO_TOPO_RANKING);
    const linhaDoParticipante = ranking.find((linha) => linha.ehVoce) ?? null;
    const participanteForaDoTopo =
      linhaDoParticipante && linhaDoParticipante.posicao > TAMANHO_TOPO_RANKING ? linhaDoParticipante : null;

    const treinoDoNivel = await prisma.treino.findFirst({
      where: { fase, nivel: nivelAtual, ativo: true },
      select: { quantidadeSemanas: true },
    });
    const sessoesNecessarias = Math.max(1, treinoDoNivel?.quantidadeSemanas ?? 1) * SESSOES_POR_SEMANA;
    const sessoesRealizadas = sessoes.filter(
      (sessao) => sessao.treino.fase === fase && sessao.treino.nivel === nivelAtual,
    ).length;
    const progressoPercentual = Math.min(100, Math.round((sessoesRealizadas / sessoesNecessarias) * 100));
    const programaConcluido =
      fase === FaseTreino.AVANCADO && nivelAtual === 2 && sessoesRealizadas >= sessoesNecessarias;

    // Percepção de esforço: só sessões com resposta (0 é um valor válido da escala OMNI).
    const percepcaoEsforco = sessoes
      .filter((sessao) => typeof sessao.esforcoOmni === 'number')
      .slice(-SESSOES_NO_GRAFICO)
      .map((sessao) => ({
        data: formatarDataCurta(sessao.dataInicio),
        valor: sessao.esforcoOmni as number,
      }));

    res.json({
      participanteId,
      mensagem: mensagemRankingPorSemana(treinosSemana, participanteId + agora.getDate()),
      fase,
      faseLabel: faseParaLabel(fase),
      semana: {
        treinosRealizados: Math.min(treinosSemana, SESSOES_POR_SEMANA),
        meta: SESSOES_POR_SEMANA,
        semanasSeguidasCompletas: semanasSeguidas,
        semanasParaEstrela: SEMANAS_PARA_ESTRELA,
      },
      ranking: {
        itens: topo,
        participanteForaDoTopo,
        totalParticipantes: ranking.length,
      },
      nivel: {
        nivelAtual,
        sessoesRealizadas: Math.min(sessoesRealizadas, sessoesNecessarias),
        sessoesNecessarias,
        progressoPercentual,
        programaConcluido,
      },
      percepcaoEsforco,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
