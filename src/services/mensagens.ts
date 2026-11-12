/**
 * Banco de mensagens do aplicativo (documento "Mensagens para o app TecnoAging").
 *
 * Embasamento teórico do documento original: Positive Framing, Teoria da
 * Autodeterminação (SDT) e Nudge Theory. O texto de cada mensagem é mantido
 * EXATAMENTE como no documento original — não alterar a escrita.
 *
 * As mensagens de "Ranking e progresso" (item 2 do documento) já estão em
 * src/routes/engajamento.ts. As mensagens de "Finalização de treino" (itens
 * 3 e 4) já estão no app mobile, em telas/treinoExecucao/ModalFinalizarTreino.tsx.
 * Este arquivo cobre os itens 1 (Tela inicial), 5 (Lembrete padrão) e 6
 * (Lembrete repetido, reaproveitado também para o lembrete semanal).
 */

/** Item 1 do documento — Tela inicial (entrada), quando o participante NÃO treinou no dia. */
export const MENSAGENS_ENTRADA_NAO_TREINOU = [
  'Que bom te ver aqui! Fazer exercícios regularmente é ter compromisso com a sua saúde. Vamos começar o treino de hoje?',
  'Bem-vindo de volta! Ao fazer seus exercícios hoje, você terá mais força e disposição para fazer o que gosta. Vamos começar?',
  'Você sabia que fazer exercícios te deixa mais disposto e independente por mais tempo? Então vamos começar?',
  'Praticar exercícios regularmente melhora o equilíbrio e previne quedas. Vamos começar o treino de hoje?',
] as const;

/** Item 1 do documento — Tela inicial (entrada), quando o participante JÁ treinou no dia e reabre o app. */
export const MENSAGENS_ENTRADA_JA_TREINOU = [
  'Você já realizou os exercícios do dia! Parabéns pela sua dedicação!',
  'Você completou a sessão de exercícios do dia. Excelente trabalho! Continue assim!',
  'Parabéns pelo treino de hoje! Você está ficando mais forte a cada dia!',
  'A cada treino, você fica melhor! Parabéns pela dedicação!',
] as const;

/** Item 1 do documento — Tela inicial (entrada), quando o participante já completou as 3 sessões da semana. */
export const MENSAGENS_ENTRADA_SEMANA_COMPLETA = [
  'Você realizou as sessões de exercícios da semana! Parabéns pela sua dedicação e cuidado com a saúde! Seu próximo treino estará disponível na segunda-feira! Te espero aqui! Até mais',
  'Você está muito comprometido/comprometida com a sua saúde, já realizou todos os treinos da semana! Continue assim! Te vejo na segunda-feira para nosso próximo treino!',
  'Todas as sessões de treino da semana foram concluídas com sucesso! Você está cada dia melhor! Nos encontramos na segunda-feira, para nosso próximo treino!',
  'Parabéns pelos treinos dessa semana! Acompanhe sua evolução na aba de progresso e ranking! Te vejo no nosso próximo treino, até lá!',
] as const;

/** Item 5 do documento — Lembrete padrão, enviado por push quando o app está fechado. */
export const MENSAGENS_LEMBRETE_PADRAO = [
  'Lembre-se do seu compromisso com a sua saúde, vamos treinar?',
  'Cuidar da sua saúde é uma escolha diária. Lembre-se de realizar seus exercícios!',
  'Quando se sentir pronto, lembre-se de realizar os exercícios para fortalecer seus músculos!',
] as const;

/**
 * Item 6 do documento — Lembrete repetido, enviado por push algumas horas depois
 * do lembrete padrão, se o treino não foi realizado. O mesmo banco de mensagens
 * é reaproveitado para o lembrete semanal (participante sem nenhum treino na
 * semana), já que o documento não traz um texto específico para esse caso —
 * apenas descreve a regra de disparo junto do item "Lembrete repetido".
 */
export const MENSAGENS_LEMBRETE_REPETIDO = [
  'Manter-se ativo te ajuda a ser independente no dia a dia. Quando estiver pronto, seus exercícios estão te esperando.',
  'Sempre que desejar começar, seus exercícios estão prontos para te ajudar!',
  'Você está se sentindo bem para fazer exercícios hoje? Se sim, vá em frente! Se precisar de descanso, respeite o seu ritmo.',
] as const;

/**
 * Item 3 do documento — terceira mensagem do fluxo de finalização antecipada
 * (1% a 49% do treino), exibida quando o participante retorna ao aplicativo.
 */
export const MENSAGEM_PERGUNTA_REFAZER_TREINO =
  'Quando você retornar por aqui, deseja refazer esse treino?';

/**
 * Escolhe uma mensagem aleatória de um banco. Recebe uma seed opcional
 * (ex: participanteId + dia) para variar a mensagem sem precisar de estado
 * no servidor — mesma estratégia já usada em src/routes/engajamento.ts.
 */
export function escolherMensagemAleatoria<T extends string>(
  mensagens: readonly T[],
  seed: number = Math.floor(Math.random() * 1_000_000),
): T {
  const indice = Math.abs(Math.trunc(seed)) % mensagens.length;
  return mensagens[indice];
}
