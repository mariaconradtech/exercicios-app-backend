import {
  FaseTreino,
  GeneroAvatar,
  StatusSessao,
  type PrismaClient,
} from '../../generated/prisma/client';

const SESSOES_POR_SEMANA = 3;
const PONTOS_POR_SESSAO = 10;
const BONUS_DUAS_SESSOES_SEMANA = 10;
const BONUS_TRES_SESSOES_SEMANA = 50;
const BONUS_TRES_SEMANAS_SEGUIDAS = 100;
const BONUS_NIVEL_COMPLETO = 100;
const NIVEIS_COM_TROFEU = [1, 2] as const;
const FASES: FaseTreino[] = [FaseTreino.INICIANTE, FaseTreino.INTERMEDIARIO, FaseTreino.AVANCADO];

/**
 * Sessão que CONTA como treino realizado: concluída (100%) ou interrompida com 50% ou mais.
 * Conta para pontos, prêmios, limite de 3 treinos/semana e progressão de nível (inclusive OMNI).
 * Decisão da pesquisadora (Alessandra, nov/2026): o público tem menor escolaridade e menos
 * familiaridade com exercício; ~15 min de uma sessão de 32–40 min já trabalham força ou equilíbrio.
 * Sessões de 1% a 49% não contam e não pedem a nota OMNI.
 * O status no banco continua INTERROMPIDA, para a pesquisa distinguir sessões completas das parciais.
 */
export const PERCENTUAL_MINIMO_PARA_CONTAR = 50;

export const filtroSessoesQueContam = {
  OR: [
    { status: StatusSessao.CONCLUIDA },
    { status: StatusSessao.INTERROMPIDA, percentualConcluido: { gte: PERCENTUAL_MINIMO_PARA_CONTAR } },
  ],
};


type PrismaExecutor = Pick<
  PrismaClient,
  'sessaoTreino' | 'perfilGamificado'
>;

type SessaoGamificacao = {
  id: number;
  dataInicio: Date;
  pontosGanhos: number;
  esforcoOmni: number | null;
  treino: {
    fase: FaseTreino;
    nivel: number;
    quantidadeSemanas: number;
  };
};

type PerfilCalculado = {
  faseAtual: FaseTreino;
  nivelAtual: number;
  pontos: number;
  estrelas: number;
  medalhas: number;
  trofeus: number;
  pontosPorSessao: Map<number, number>;
};

export function inicioDaSemana(data: Date): Date {
  const inicio = new Date(data);
  inicio.setHours(0, 0, 0, 0);
  const diasDesdeSegunda = (inicio.getDay() + 6) % 7;
  inicio.setDate(inicio.getDate() - diasDesdeSegunda);
  return inicio;
}

function chaveSemana(data: Date): string {
  return inicioDaSemana(data).toISOString().slice(0, 10);
}

function faseSeguinte(fase: FaseTreino): FaseTreino | null {
  const index = FASES.indexOf(fase);
  return index >= 0 ? FASES[index + 1] ?? null : null;
}

function chaveNivel(fase: FaseTreino, nivel: number): string {
  return `${fase}:${nivel}`;
}

function adicionarPontosSessao(pontosPorSessao: Map<number, number>, sessaoId: number, pontos: number) {
  pontosPorSessao.set(sessaoId, (pontosPorSessao.get(sessaoId) ?? 0) + pontos);
}


/**
 * Regras de progressão (tabela da pesquisadora). O nível termina pelo que vier primeiro:
 *  - total de treinos: quantidadeSemanas × 3 (Iniciante N1: 6 semanas = 18; demais: 8 semanas = 24);
 *  - esforço OMNI: notas de 0 a 4 em sessões seguidas, respeitando um mínimo de treinos e semanas.
 * Avançado N2 é o último nível: vai até o fim das semanas, sem progressão pela OMNI
 * (resposta da pesquisadora nas dúvidas do TCC).
 */
const ESFORCO_OMNI_LEVE_MAXIMO = 4;

type RegraProgressaoOmni = {
  sessoesSeguidas: number;
  minimoTreinos: number;
  minimoSemanas: number;
};

export function regraProgressaoOmni(fase: FaseTreino, nivel: number): RegraProgressaoOmni | null {
  if (fase === FaseTreino.AVANCADO && nivel === 2) {
    return null;
  }
  if (fase === FaseTreino.INICIANTE && nivel === 1) {
    return { sessoesSeguidas: 9, minimoTreinos: 9, minimoSemanas: 3 };
  }
  return { sessoesSeguidas: 12, minimoTreinos: 12, minimoSemanas: 4 };
}


export function indiceConclusaoNivel(
  sessoesDoNivel: Pick<SessaoGamificacao, 'dataInicio' | 'esforcoOmni' | 'treino'>[],
): number | null {
  if (sessoesDoNivel.length === 0) {
    return null;
  }

  const { fase, nivel } = sessoesDoNivel[0].treino;
  const totalNecessario = Math.max(1, sessoesDoNivel[0].treino.quantidadeSemanas) * SESSOES_POR_SEMANA;
  const regraOmni = regraProgressaoOmni(fase, nivel);
  const semanas = new Set<string>();
  let sequenciaOmni = 0;

  for (let index = 0; index < sessoesDoNivel.length; index += 1) {
    const sessao = sessoesDoNivel[index];
    const treinosFeitos = index + 1;
    semanas.add(chaveSemana(sessao.dataInicio));

    if (treinosFeitos >= totalNecessario) {
      return index;
    }

    if (!regraOmni) {
      continue;
    }

    const esforcoLeve =
      typeof sessao.esforcoOmni === 'number' && sessao.esforcoOmni <= ESFORCO_OMNI_LEVE_MAXIMO;
    sequenciaOmni = esforcoLeve ? sequenciaOmni + 1 : 0;

    if (
      sequenciaOmni >= regraOmni.sessoesSeguidas &&
      treinosFeitos >= regraOmni.minimoTreinos &&
      semanas.size >= regraOmni.minimoSemanas
    ) {
      return index;
    }
  }

  return null;
}

function calcularFaseNivelAtual(sessoesPorNivel: Map<string, SessaoGamificacao[]>): {
  faseAtual: FaseTreino;
  nivelAtual: number;
} {
  let faseAtual: FaseTreino = FaseTreino.INICIANTE;
  let nivelAtual = 1;

  for (const fase of FASES) {
    const nivel1 = sessoesPorNivel.get(chaveNivel(fase, 1)) ?? [];
    const nivel2 = sessoesPorNivel.get(chaveNivel(fase, 2)) ?? [];
    const nivel1Completo = indiceConclusaoNivel(nivel1) !== null;
    const nivel2Completo = indiceConclusaoNivel(nivel2) !== null;

    if (nivel2Completo) {
      const proximaFase = faseSeguinte(fase);
      if (!proximaFase) {
        return { faseAtual: fase, nivelAtual: 2 };
      }

      faseAtual = proximaFase;
      nivelAtual = 1;
      continue;
    }

    return {
      faseAtual: fase,
      nivelAtual: nivel1Completo ? 2 : 1,
    };
  }

  return { faseAtual, nivelAtual };
}

function calcularPerfilGamificado(sessoes: SessaoGamificacao[]): PerfilCalculado {
  const sessoesOrdenadas = [...sessoes].sort(
    (a, b) => a.dataInicio.getTime() - b.dataInicio.getTime(),
  );
  const pontosPorSessao = new Map<number, number>();
  const sessoesPorNivel = new Map<string, SessaoGamificacao[]>();
  const sessoesPorSemana = new Map<string, SessaoGamificacao[]>();

  for (const sessao of sessoesOrdenadas) {
    adicionarPontosSessao(pontosPorSessao, sessao.id, PONTOS_POR_SESSAO);

    const nivelKey = chaveNivel(sessao.treino.fase, sessao.treino.nivel);
    sessoesPorNivel.set(nivelKey, [...(sessoesPorNivel.get(nivelKey) ?? []), sessao]);

    const semanaKey = chaveSemana(sessao.dataInicio);
    sessoesPorSemana.set(semanaKey, [...(sessoesPorSemana.get(semanaKey) ?? []), sessao]);
  }

  const { faseAtual, nivelAtual } = calcularFaseNivelAtual(sessoesPorNivel);
  let pontos = 0;
  let estrelas = 0;
  let medalhas = 0;
  let trofeus = 0;

  for (const sessao of sessoesOrdenadas) {
    if (sessao.treino.fase === faseAtual) {
      pontos += PONTOS_POR_SESSAO;
    }
  }

  const semanasOrdenadas = [...sessoesPorSemana.entries()]
    .map(([semana, sessoesDaSemana]) => ({
      semana,
      inicio: inicioDaSemana(sessoesDaSemana[0].dataInicio),
      sessoes: [...sessoesDaSemana].sort((a, b) => a.dataInicio.getTime() - b.dataInicio.getTime()),
    }))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  for (const semana of semanasOrdenadas) {
    const segundaSessao = semana.sessoes[1];
    const terceiraSessao = semana.sessoes[2];

    if (segundaSessao) {
      adicionarPontosSessao(pontosPorSessao, segundaSessao.id, BONUS_DUAS_SESSOES_SEMANA);
      if (segundaSessao.treino.fase === faseAtual) {
        pontos += BONUS_DUAS_SESSOES_SEMANA;
      }
    }

    if (terceiraSessao) {
      adicionarPontosSessao(pontosPorSessao, terceiraSessao.id, BONUS_TRES_SESSOES_SEMANA);
      if (terceiraSessao.treino.fase === faseAtual) {
        pontos += BONUS_TRES_SESSOES_SEMANA;
        medalhas += 1;
      }
    }
  }

  let semanasSeguidas = 0;
  let semanaAnterior: Date | null = null;

  for (const semana of semanasOrdenadas) {
    const cumpriuMetaSemanal = semana.sessoes.length >= SESSOES_POR_SEMANA;
    const consecutiva =
      semanaAnterior !== null &&
      semana.inicio.getTime() - semanaAnterior.getTime() === 7 * 24 * 60 * 60 * 1000;

    semanasSeguidas = cumpriuMetaSemanal ? (consecutiva ? semanasSeguidas + 1 : 1) : 0;
    semanaAnterior = semana.inicio;

    if (semanasSeguidas === 3) {
      const sessaoPremiada = semana.sessoes[2];
      adicionarPontosSessao(pontosPorSessao, sessaoPremiada.id, BONUS_TRES_SEMANAS_SEGUIDAS);
      estrelas += 1;
      if (sessaoPremiada.treino.fase === faseAtual) {
        pontos += BONUS_TRES_SEMANAS_SEGUIDAS;
      }
      semanasSeguidas = 0;
    }
  }

  for (const nivel of NIVEIS_COM_TROFEU) {
    for (const fase of FASES) {
      const sessoesDoNivel = sessoesPorNivel.get(chaveNivel(fase, nivel)) ?? [];
      if (sessoesDoNivel.length === 0) {
        continue;
      }

      const sessoesOrdenadasDoNivel = [...sessoesDoNivel].sort(
        (a, b) => a.dataInicio.getTime() - b.dataInicio.getTime(),
      );
      // Mesmo prêmio para os dois caminhos (total de treinos ou OMNI): troféu, estrela e +100.
      const indiceConclusao = indiceConclusaoNivel(sessoesOrdenadasDoNivel);

      if (indiceConclusao !== null) {
        const sessaoPremiada = sessoesOrdenadasDoNivel[indiceConclusao];
        adicionarPontosSessao(pontosPorSessao, sessaoPremiada.id, BONUS_NIVEL_COMPLETO);
        trofeus += 1;
        estrelas += 1;
        if (fase === faseAtual) {
          pontos += BONUS_NIVEL_COMPLETO;
        }
      }
    }
  }

  return {
    faseAtual,
    nivelAtual,
    pontos,
    estrelas,
    medalhas,
    trofeus,
    pontosPorSessao,
  };
}

export async function recalcularGamificacaoParticipante(
  prismaClient: PrismaExecutor,
  participanteId: number,
): Promise<PerfilCalculado> {
  const sessoes = await prismaClient.sessaoTreino.findMany({
    where: {
      participanteId,
      ...filtroSessoesQueContam,
    },
    include: {
      treino: true,
    },
    orderBy: { dataInicio: 'asc' },
  });

  const perfilCalculado = calcularPerfilGamificado(sessoes as SessaoGamificacao[]);

  await prismaClient.perfilGamificado.upsert({
    where: { participanteId },
    update: {
      faseAtual: perfilCalculado.faseAtual,
      nivelAtual: perfilCalculado.nivelAtual,
      pontos: perfilCalculado.pontos,
      estrelas: perfilCalculado.estrelas,
      medalhas: perfilCalculado.medalhas,
      trofeus: perfilCalculado.trofeus,
    },
    create: {
      participanteId,
      avatarGenero: GeneroAvatar.FEMININO,
      faseAtual: perfilCalculado.faseAtual,
      nivelAtual: perfilCalculado.nivelAtual,
      pontos: perfilCalculado.pontos,
      estrelas: perfilCalculado.estrelas,
      medalhas: perfilCalculado.medalhas,
      trofeus: perfilCalculado.trofeus,
    },
  });

  for (const sessao of sessoes as SessaoGamificacao[]) {
    const pontosGanhos = perfilCalculado.pontosPorSessao.get(sessao.id) ?? 0;
    if (sessao.pontosGanhos === pontosGanhos) {
      continue;
    }

    await prismaClient.sessaoTreino.update({
      where: { id: sessao.id },
      data: { pontosGanhos },
    });
  }

  return perfilCalculado;
}

const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

export function calcularSequenciaSemanasCompletas(datasSessoes: Date[], agora: Date = new Date()): number {
  const porSemana = new Map<number, number>();
  for (const data of datasSessoes) {
    const inicio = inicioDaSemana(data).getTime();
    porSemana.set(inicio, (porSemana.get(inicio) ?? 0) + 1);
  }

  const semanaAtual = inicioDaSemana(agora).getTime();
  if ((porSemana.get(semanaAtual) ?? 0) < SESSOES_POR_SEMANA) {
    porSemana.delete(semanaAtual);
  }

  const semanas = [...porSemana.entries()].sort(([a], [b]) => a - b);
  let sequencia = 0;
  let anterior: number | null = null;

  for (const [inicio, total] of semanas) {
    const consecutiva = anterior !== null && inicio - anterior === UMA_SEMANA_MS;
    sequencia = total >= SESSOES_POR_SEMANA ? (consecutiva ? sequencia + 1 : 1) : 0;
    anterior = inicio;
    if (sequencia === 3) {
      sequencia = 0;
    }
  }

  if (anterior === null || anterior < semanaAtual - UMA_SEMANA_MS) {
    return 0;
  }

  return sequencia;
}
