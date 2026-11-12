/** Faixas etárias do estudo (público 60+), usadas no Painel do Pesquisador. */
export type FaixaEtaria = '60-64' | '65-69' | '70-74' | '75-79' | '80+';

export const FAIXAS_ETARIAS: FaixaEtaria[] = ['60-64', '65-69', '70-74', '75-79', '80+'];

/** Idade completa (em anos) na data de referência (padrão: agora). */
export function calcularIdade(dataNascimento: Date, referencia: Date = new Date()): number {
  let idade = referencia.getFullYear() - dataNascimento.getFullYear();
  const aindaNaoFezAniversarioEsteAno =
    referencia.getMonth() < dataNascimento.getMonth() ||
    (referencia.getMonth() === dataNascimento.getMonth() && referencia.getDate() < dataNascimento.getDate());

  if (aindaNaoFezAniversarioEsteAno) {
    idade -= 1;
  }

  return idade;
}

/** Classifica uma idade em faixa etária. Retorna `null` para idades fora do público do estudo (< 60). */
export function classificarFaixaEtaria(idade: number): FaixaEtaria | null {
  if (idade < 60) return null;
  if (idade <= 64) return '60-64';
  if (idade <= 69) return '65-69';
  if (idade <= 74) return '70-74';
  if (idade <= 79) return '75-79';
  return '80+';
}
