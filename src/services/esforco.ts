/**
 * Classificação da percepção subjetiva de esforço (escala OMNI, 0 a 10) em faixas de
 * intensidade de treino. Mesmos limites usados no eixo do gráfico de evolução do PSE
 * no Painel do Pesquisador — por isso "baseada no intervalo do gráfico".
 *
 *  - Leve:     0 a 4
 *  - Moderada: 5 a 6
 *  - Vigorosa: 7 a 10
 */
export type FaixaIntensidade = 'LEVE' | 'MODERADA' | 'VIGOROSA';

export const FAIXAS_INTENSIDADE: FaixaIntensidade[] = ['LEVE', 'MODERADA', 'VIGOROSA'];

const LIMITE_LEVE_MAXIMO = 4;
const LIMITE_MODERADA_MAXIMO = 6;

/**
 * Classifica uma nota OMNI (0–10) em uma faixa de intensidade. Retorna `null` para
 * valores fora da escala (não deveria ocorrer, mas evita quebrar o cálculo caso
 * algum dado inconsistente exista no banco).
 */
export function classificarFaixaIntensidade(esforcoOmni: number): FaixaIntensidade | null {
  if (!Number.isFinite(esforcoOmni) || esforcoOmni < 0 || esforcoOmni > 10) {
    return null;
  }
  if (esforcoOmni <= LIMITE_LEVE_MAXIMO) {
    return 'LEVE';
  }
  if (esforcoOmni <= LIMITE_MODERADA_MAXIMO) {
    return 'MODERADA';
  }
  return 'VIGOROSA';
}
