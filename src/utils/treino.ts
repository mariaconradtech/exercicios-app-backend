import { FaseTreino } from '../../generated/prisma/client';

const FASE_PARA_LABEL: Record<FaseTreino, string> = {
  [FaseTreino.INICIANTE]: 'Iniciante',
  [FaseTreino.INTERMEDIARIO]: 'Intermediário',
  [FaseTreino.AVANCADO]: 'Avançado',
};

const LABEL_PARA_FASE = new Map<string, FaseTreino>(
  Object.entries(FASE_PARA_LABEL).map(([enumValue, label]) => [label, enumValue as FaseTreino]),
);

export function faseParaLabel(fase: FaseTreino): string {
  return FASE_PARA_LABEL[fase];
}

export function labelParaFase(label: string): FaseTreino | null {
  return LABEL_PARA_FASE.get(label) ?? null;
}

export const NIVEIS_VALIDOS = [1, 2] as const;

type ItemDuracao = {
  series: number;
  descansoSegundos: number;
  multiplicadorVelocidade: number;
};

/**
 * Tempo base (em segundos) assumido para completar uma série de um exercício.
 * A entidade Exercicio não guarda tempo/repetições, então usamos uma constante
 * ajustável até existir um dado mais preciso vindo do cadastro de exercícios.
 */
const TEMPO_BASE_SEGUNDOS_POR_SERIE = 40;

/**
 * Estima a duração total do treino em minutos, arredondando para cima.
 *
 * Para cada exercício: tempo de execução das séries (ajustado pelo
 * multiplicador de velocidade) + descanso entre as séries daquele exercício
 * (`descansoSegundos`, aplicado `series - 1` vezes).
 * Entre exercícios distintos aplica-se o descanso geral do treino
 * (`descansoEntreSeriesSegundos`), uma vez por transição.
 */
export function calcularDuracaoEstimadaMinutos(
  exercicios: ItemDuracao[],
  descansoEntreSeriesSegundos: number,
): number {
  const segundosPorExercicio = exercicios.reduce((total, item) => {
    const tempoExecucaoSegundos = (item.series * TEMPO_BASE_SEGUNDOS_POR_SERIE) / item.multiplicadorVelocidade;
    const descansoProprioSegundos = item.descansoSegundos * Math.max(item.series - 1, 0);
    return total + tempoExecucaoSegundos + descansoProprioSegundos;
  }, 0);

  const transicoesEntreExercicios = Math.max(exercicios.length - 1, 0);
  const segundosTransicao = transicoesEntreExercicios * descansoEntreSeriesSegundos;

  const totalSegundos = segundosPorExercicio + segundosTransicao;
  return Math.max(1, Math.ceil(totalSegundos / 60));
}
