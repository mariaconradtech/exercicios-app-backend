import { Router } from 'express';

import { FaseTreino, StatusSessao } from '../../generated/prisma/client';
import { prisma } from '../prismaClient';
import { validarPermissaoVisualizarEngajamento } from '../middlewares/engajamentoPermissao';

type CategoriaPodio = 'OURO' | 'PRATA' | 'BRONZE';

function formatarDataCurta(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
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

function objetivoPorFase(fase: FaseTreino): number {
  if (fase === FaseTreino.INICIANTE) {
    return 10;
  }

  if (fase === FaseTreino.INTERMEDIARIO) {
    return 20;
  }

  return 30;
}

function proximaFase(fase: FaseTreino): FaseTreino | null {
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
          orderBy: { dataInicio: 'asc' },
        },
      },
    });

    const agora = new Date();
    const inicioJanelaAtual = new Date(agora);
    inicioJanelaAtual.setDate(agora.getDate() - 30);

    const inicioJanelaAnterior = new Date(agora);
    inicioJanelaAnterior.setDate(agora.getDate() - 60);

    const estatisticas = participantes.map((participante) => {
      const sessoesConcluidas = participante.sessoes;
      const totalConcluidas = sessoesConcluidas.length;

      const concluidasJanelaAtual = sessoesConcluidas.filter((sessao) => sessao.dataInicio >= inicioJanelaAtual)
        .length;

      const concluidasJanelaAnterior = sessoesConcluidas.filter(
        (sessao) => sessao.dataInicio >= inicioJanelaAnterior && sessao.dataInicio < inicioJanelaAtual,
      ).length;

      const categoriaAtual = categoriaPorFrequencia(concluidasJanelaAtual);
      const categoriaAnterior = categoriaPorFrequencia(concluidasJanelaAnterior);

      return {
        participanteId: participante.id,
        nome: participante.usuario.nome,
        nomeAvatar: participante.perfil?.nomeAvatar?.trim() || participante.usuario.nome,
        perfil: participante.perfil,
        totalConcluidas,
        concluidasJanelaAtual,
        categoriaAtual,
        categoriaAnterior,
        sessoesConcluidas,
      };
    });

    const rankingOrdenado = [...estatisticas].sort((a, b) => {
      if (b.totalConcluidas !== a.totalConcluidas) {
        return b.totalConcluidas - a.totalConcluidas;
      }

      return a.nome.localeCompare(b.nome);
    });

    const participanteAtual = estatisticas.find((item) => item.participanteId === participanteId);
    if (!participanteAtual) {
      res.status(404).json({ error: 'Participante não encontrado no ranking' });
      return;
    }

    const perfilAtual = participanteAtual.perfil;
    const faseAtual = perfilAtual?.faseAtual ?? FaseTreino.INICIANTE;
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
        bronze: Math.max(0, Math.round(pontosBase * 0.8)),
        estrelas: item.perfil?.estrelas ?? Math.round(item.totalConcluidas * 0.6),
        medalhas: item.perfil?.medalhas ?? Math.round(item.totalConcluidas * 0.45),
        trofeus: item.perfil?.trofeus ?? Math.round(item.totalConcluidas * 0.3),
      };
    });

    res.json({
      participanteId,
      categoriaAtual: participanteAtual.categoriaAtual,
      mudouCategoria: participanteAtual.categoriaAtual !== participanteAtual.categoriaAnterior,
      mensagemCelebracao:
        participanteAtual.categoriaAtual !== participanteAtual.categoriaAnterior
          ? 'Parabéns, você subiu de categoria de engajamento!'
          : 'Parabéns, você treinou essa semana e manteve sua consistência.',
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