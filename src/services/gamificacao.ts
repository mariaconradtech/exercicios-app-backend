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

type PrismaExecutor = Pick<
  PrismaClient,
  'sessaoTreino' | 'perfilGamificado'
>;

type SessaoGamificacao = {
  id: number;
  dataInicio: Date;
  pontosGanhos: number;
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

function inicioDaSemana(data: Date): Date {
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

function sessoesNecessariasParaNivel(sessao: SessaoGamificacao): number {
  return Math.max(1, sessao.treino.quantidadeSemanas) * SESSOES_POR_SEMANA;
}

function calcularFaseNivelAtual(sessoesPorNivel: Map<string, SessaoGamificacao[]>): {
  faseAtual: FaseTreino;
  nivelAtual: number;
} {
  let faseAtual = FaseTreino.INICIANTE;
  let nivelAtual = 1;

  for (const fase of FASES) {
    const nivel1 = sessoesPorNivel.get(chaveNivel(fase, 1)) ?? [];
    const nivel2 = sessoesPorNivel.get(chaveNivel(fase, 2)) ?? [];
    const nivel1Completo =
      nivel1.length > 0 && nivel1.length >= sessoesNecessariasParaNivel(nivel1[0]);
    const nivel2Completo =
      nivel2.length > 0 && nivel2.length >= sessoesNecessariasParaNivel(nivel2[0]);

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
      const sessoesNecessarias = sessoesNecessariasParaNivel(sessoesOrdenadasDoNivel[0]);

      if (sessoesOrdenadasDoNivel.length >= sessoesNecessarias) {
        const sessaoPremiada = sessoesOrdenadasDoNivel[sessoesNecessarias - 1];
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
      status: StatusSessao.CONCLUIDA,
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
