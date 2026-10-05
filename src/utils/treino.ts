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
  descansoTransicaoSegundos: number;
  multiplicadorVelocidade: number;
};

/**
 * Tempo base (em segundos) assumido para completar uma série de um exercício.
 * A entidade Exercicio não guarda tempo/repetições, então usamos uma constante
 * ajustável até existir um dado mais preciso vindo do cadastro de exercícios.
 */
export const TEMPO_BASE_SEGUNDOS_POR_SERIE = 40;

/**
 * Duração de uma única série de um exercício ("Tempo de Série" cadastrado
 * pelo pesquisador), derivada do multiplicador de velocidade salvo em
 * TreinoExercicio. É o mesmo valor usado na tela de execução do participante
 * (TreinoExercicioDTO.duracaoEstimadaSegundos).
 */
export function duracaoSerieSegundos(multiplicadorVelocidade: number): number {
  return Math.max(1, Math.round(TEMPO_BASE_SEGUNDOS_POR_SERIE / multiplicadorVelocidade));
}

/**
 * Estima a duração total do treino em minutos, arredondando para cima.
 *
 * Para cada exercício: tempo de execução das séries (ajustado pelo
 * multiplicador de velocidade) + descanso entre as séries daquele exercício
 * (`descansoSegundos`, aplicado `series - 1` vezes).
 * Ao concluir cada exercício (exceto o último) aplica-se o seu próprio
 * descanso de transição (`descansoTransicaoSegundos`) antes do próximo.
 */
export function calcularDuracaoEstimadaMinutos(exercicios: ItemDuracao[]): number {
  const segundosPorExercicio = exercicios.reduce((total, item, indice) => {
    const tempoExecucaoSegundos = (item.series * TEMPO_BASE_SEGUNDOS_POR_SERIE) / item.multiplicadorVelocidade;
    const descansoProprioSegundos = item.descansoSegundos * Math.max(item.series - 1, 0);
    const ehUltimoExercicio = indice === exercicios.length - 1;
    const descansoTransicaoSegundos = ehUltimoExercicio ? 0 : item.descansoTransicaoSegundos;
    return total + tempoExecucaoSegundos + descansoProprioSegundos + descansoTransicaoSegundos;
  }, 0);

  return Math.max(1, Math.ceil(segundosPorExercicio / 60));
}
