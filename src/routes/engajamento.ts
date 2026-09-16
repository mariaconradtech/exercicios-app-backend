import { Router } from 'express';

import { FaseTreino, StatusSessao } from '../../generated/prisma/client';
import { prisma } from '../prismaClient';
import { validarPermissaoVisualizarEngajamento } from '../middlewares/engajamentoPermissao';

type CategoriaPodio = 'OURO' | 'PRATA' | 'BRONZE';
type SessaoConcluidaEngajamento = {
  dataInicio: Date;
  pontosGanhos: number;
  treino: {
    fase: FaseTreino;
    nivel: number;
    quantidadeSemanas: number;
  };
};

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

const mensagensRankingSemTreino = [
  'Seu progresso continua te esperando. Realize um treino nesta semana para avançar no ranking!',
  'Cada treino ajuda você a ficar mais forte. Quando estiver pronto, acompanhe sua evolução por aqui!',
  'Você ainda pode movimentar sua semana. Faça seu próximo treino para somar pontos e cuidar da sua saúde!',
];

function escolherMensagem(mensagens: string[], seed: number): string {
  return mensagens[Math.abs(seed) % mensagens.length];
}

function formatarDataCurta(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}

function inicioDaSemana(data: Date): Date {
  const inicio = new Date(data);
  inicio.setHours(0, 0, 0, 0);
  const diasDesdeSegunda = (inicio.getDay() + 6) % 7;
  inicio.setDate(inicio.getDate() - diasDesdeSegunda);
  return inicio;
}

function adicionarDias(data: Date, dias: number): Date {
  const novaData = new Date(data);
  novaData.setDate(novaData.getDate() + dias);
  return novaData;
}

function categoriaPorFrequencia(totalTreinos: number): CategoriaPodio {
  if (totalTreinos >= 12) {
    return 'OURO';
  }

  if (totalTreinos >= 8) {
    return 'PRATA';
  }

  return 'BRONZE';
}

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

function mensagemRankingPorSemana(concluidasSemanaAtual: number, participanteId: number): string {
  if (concluidasSemanaAtual >= 3) {
    return escolherMensagem(mensagensRankingSemanaCompleta, participanteId + concluidasSemanaAtual);
  }

  if (concluidasSemanaAtual >= 1) {
    return escolherMensagem(mensagensRankingSemanaParcial, participanteId + concluidasSemanaAtual);
  }

  return escolherMensagem(mensagensRankingSemTreino, participanteId);
}

function contarSessoesDaSemanaAteData(sessoes: SessaoConcluidaEngajamento[], data: Date): number {
  const inicioSemana = inicioDaSemana(data);
  const fimSemana = adicionarDias(inicioSemana, 7);

  return sessoes.filter(
    (sessao) =>
      sessao.dataInicio >= inicioSemana &&
      sessao.dataInicio < fimSemana &&
      sessao.dataInicio <= data,
  ).length;
}

function completouTresSemanasSeguidas(sessoes: SessaoConcluidaEngajamento[], data: Date): boolean {
  const inicioSemanaAtual = inicioDaSemana(data);

  for (let offset = 0; offset < 3; offset += 1) {
    const inicioSemana = adicionarDias(inicioSemanaAtual, offset * -7);
    const fimSemana = adicionarDias(inicioSemana, 7);
    const totalSemana = sessoes.filter(
      (sessao) => sessao.dataInicio >= inicioSemana && sessao.dataInicio < fimSemana,
    ).length;

    if (totalSemana < 3) {
      return false;
    }
  }

  return true;
}

function completouNivel(sessoes: SessaoConcluidaEngajamento[], ultimaSessao: SessaoConcluidaEngajamento): boolean {
  const totalSessoesNivel = sessoes.filter(
    (sessao) =>
      sessao.dataInicio <= ultimaSessao.dataInicio &&
      sessao.treino.fase === ultimaSessao.treino.fase &&
      sessao.treino.nivel === ultimaSessao.treino.nivel,
  ).length;
  const necessarias = Math.max(1, ultimaSessao.treino.quantidadeSemanas) * 3;

  return totalSessoesNivel === necessarias;
}

function mensagensGamificacaoUltimaSessao(
  ultimaSessao: SessaoConcluidaEngajamento | undefined,
  sessoes: SessaoConcluidaEngajamento[],
): string[] {
  if (!ultimaSessao || ultimaSessao.pontosGanhos <= 0) {
    return [];
  }

  const mensagens: string[] = [];
  const treinosSemana = contarSessoesDaSemanaAteData(sessoes, ultimaSessao.dataInicio);

  if (treinosSemana >= 3) {
    mensagens.push('Você completou 3 treinos essa semana! Ganhou +50 pontos bônus e medalha!');
  } else if (treinosSemana === 2) {
    mensagens.push('Você ganhou 10 pontos pelo treino de hoje + 10 pontos bônus por mais um treino na semana!');
  } else {
    mensagens.push('Você ganhou 10 pontos por realizar o treino de hoje!');
  }

  if (completouTresSemanasSeguidas(sessoes, ultimaSessao.dataInicio)) {
    mensagens.push('Você completou as últimas 3 semanas de treino! Ganhou +100 pontos bônus e uma estrela!');
  }

  if (completouNivel(sessoes, ultimaSessao)) {
    mensagens.push(
      ultimaSessao.treino.nivel === 2
        ? 'Você completou mais um nível e passou de fase no game! As conquistas de hoje foram +100 pontos bônus, uma estrela e mais um troféu!'
        : 'Você completou o nível de treino e conquistou +100 pontos bônus, uma estrela e ganhou o seu troféu!',
    );
  }

  return mensagens;
}

export const engajamentoRouter = Router();

engajamentoRouter.get('/', validarPermissaoVisualizarEngajamento, async (req, res) => {
  try {
    const participanteId = (req as typeof req & { participanteId: number }).participanteId;

    const participantes = await prisma.participante.findMany({
      include: {
        usuario: true,
        perfil: true,
        sessoes: {
          where: { status: StatusSessao.CONCLUIDA },
          include: {
            treino: {
              select: {
                fase: true,
                nivel: true,
                quantidadeSemanas: true,
              },
            },
          },
          orderBy: { dataInicio: 'asc' },
        },
      },
    });

    const agora = new Date();
    const inicioJanelaAtual = new Date(agora);
    inicioJanelaAtual.setDate(agora.getDate() - 30);

    const inicioJanelaAnterior = new Date(agora);
    inicioJanelaAnterior.setDate(agora.getDate() - 60);
    const inicioSemanaAtual = inicioDaSemana(agora);

    const estatisticas = participantes.map((participante) => {
      const sessoesConcluidas = participante.sessoes;
      const totalConcluidas = sessoesConcluidas.length;

      const concluidasJanelaAtual = sessoesConcluidas.filter((sessao) => sessao.dataInicio >= inicioJanelaAtual)
        .length;

      const concluidasJanelaAnterior = sessoesConcluidas.filter(
        (sessao) => sessao.dataInicio >= inicioJanelaAnterior && sessao.dataInicio < inicioJanelaAtual,
      ).length;
      const concluidasSemanaAtual = sessoesConcluidas.filter((sessao) => sessao.dataInicio >= inicioSemanaAtual)
        .length;

      const categoriaAtual = categoriaPorFrequencia(concluidasJanelaAtual);
      const categoriaAnterior = categoriaPorFrequencia(concluidasJanelaAnterior);

      return {
        participanteId: participante.id,
        nome: participante.usuario.nome,
        nomeAvatar: participante.perfil?.nomeAvatar?.trim() || participante.usuario.nome,
        perfil: participante.perfil,
        totalConcluidas,
        concluidasJanelaAtual,
        concluidasSemanaAtual,
        categoriaAtual,
        categoriaAnterior,
        sessoesConcluidas,
      };
    });

    const participanteAtual = estatisticas.find((item) => item.participanteId === participanteId);
    if (!participanteAtual) {
      res.status(404).json({ error: 'Participante não encontrado no ranking' });
      return;
    }

    const perfilAtual = participanteAtual.perfil;
    const faseAtual = perfilAtual?.faseAtual ?? FaseTreino.INICIANTE;
    const rankingOrdenado = estatisticas
      .filter((item) => (item.perfil?.faseAtual ?? FaseTreino.INICIANTE) === faseAtual)
      .sort((a, b) => {
        const pontosA = a.perfil?.pontos ?? 0;
        const pontosB = b.perfil?.pontos ?? 0;

        if (pontosB !== pontosA) {
          return pontosB - pontosA;
        }

        if (b.totalConcluidas !== a.totalConcluidas) {
          return b.totalConcluidas - a.totalConcluidas;
        }

        return a.nome.localeCompare(b.nome);
      });
    const objetivoAtual = objetivoPorFase(faseAtual);
    const faltantes = Math.max(0, objetivoAtual - participanteAtual.totalConcluidas);
    const progressoPercentual = Math.min(
      100,
      Math.round((participanteAtual.totalConcluidas / objetivoAtual) * 100),
    );

    const historicoEsforco = participanteAtual.sessoesConcluidas
      .filter((sessao) => typeof sessao.esforcoOmni === 'number')
      .slice(-10)
      .map((sessao) => ({
        data: formatarDataCurta(sessao.dataInicio),
        valor: sessao.esforcoOmni as number,
      }));

    const podioCategorias: CategoriaPodio[] = ['OURO', 'PRATA', 'BRONZE'];
    const podio = rankingOrdenado.slice(0, 3).map((item, index) => ({
      categoria: podioCategorias[index] ?? 'BRONZE',
      participanteNome: item.nomeAvatar,
      treinosConcluidos: item.totalConcluidas,
    }));

    const ranking = rankingOrdenado.slice(0, 6).map((item) => {
      const pontosBase = item.perfil?.pontos ?? item.totalConcluidas * 10;

      return {
        participanteId: item.participanteId,
        nome: item.nomeAvatar,
        nomeAvatar: item.nomeAvatar,
        bronze: pontosBase,
        estrelas: item.perfil?.estrelas ?? Math.round(item.totalConcluidas * 0.6),
        medalhas: item.perfil?.medalhas ?? Math.round(item.totalConcluidas * 0.45),
        trofeus: item.perfil?.trofeus ?? Math.round(item.totalConcluidas * 0.3),
      };
    });
    const posicaoRanking = rankingOrdenado.findIndex((item) => item.participanteId === participanteId) + 1;
    const ultimaSessao = participanteAtual.sessoesConcluidas[participanteAtual.sessoesConcluidas.length - 1];
    const mensagensGamificacao = mensagensGamificacaoUltimaSessao(
      ultimaSessao,
      participanteAtual.sessoesConcluidas,
    );

    res.json({
      participanteId,
      categoriaAtual: participanteAtual.categoriaAtual,
      mudouCategoria: participanteAtual.categoriaAtual !== participanteAtual.categoriaAnterior,
      mensagemCelebracao: mensagemRankingPorSemana(participanteAtual.concluidasSemanaAtual, participanteId),
      resumoGamificacao: {
        faseAtual: faseParaLabel(faseAtual),
        posicaoRanking,
        totalParticipantesFase: rankingOrdenado.length,
        sessoesSemanaAtual: participanteAtual.concluidasSemanaAtual,
        mensagens: mensagensGamificacao,
      },
      podio,
      ranking,
      proximoNivel: {
        nivelAtual: faseParaLabel(faseAtual),
        proximoNivel: proximaFase(faseAtual) ? faseParaLabel(proximaFase(faseAtual) as FaseTreino) : null,
        treinosConcluidos: participanteAtual.totalConcluidas,
        treinosFaltantes: faltantes,
        progressoPercentual,
      },
      percepcaoEsforco: historicoEsforco,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});