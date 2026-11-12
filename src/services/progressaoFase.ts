import { FaseTreino } from '../../generated/prisma/client';
import { indiceConclusaoNivel } from './gamificacao';

const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

type SessaoProgressao = {
  dataInicio: Date;
  esforcoOmni: number | null;
  treino: {
    fase: FaseTreino;
    nivel: number;
    quantidadeSemanas: number;
  };
};

export interface ProgressaoFaseResultado {
  iniciantesParaIntermediario: number;
  iniciantesParaIntermediarioPct: number;
  intermediariosParaAvancado: number;
  intermediariosParaAvancadoPct: number;
  semanasMediasAteIntermediario: number;
  semanasMediasAteAvancado: number;
}

function chaveNivel(fase: FaseTreino, nivel: number): string {
  return `${fase}:${nivel}`;
}

/**
 * Detecta, para um participante, a sessão (dentro de um nível específico) em que ele
 * completou aquele nível — pelo total de treinos OU pela regra de progressão por OMNI
 * (mesma lógica usada em `recalcularGamificacaoParticipante`, aqui só leitura).
 */
function encontrarSessaoDeConclusao(
  sessoesOrdenadas: SessaoProgressao[],
  fase: FaseTreino,
  nivel: number,
): SessaoProgressao | null {
  const sessoesDoNivel = sessoesOrdenadas
    .filter((sessao) => sessao.treino.fase === fase && sessao.treino.nivel === nivel)
    .sort((a, b) => a.dataInicio.getTime() - b.dataInicio.getTime());

  if (sessoesDoNivel.length === 0) {
    return null;
  }

  const indice = indiceConclusaoNivel(sessoesDoNivel);
  return indice !== null ? sessoesDoNivel[indice] : null;
}

function primeiraSessaoDoNivel(
  sessoesOrdenadas: SessaoProgressao[],
  fase: FaseTreino,
  nivel: number,
): SessaoProgressao | null {
  const sessoesDoNivel = sessoesOrdenadas
    .filter((sessao) => sessao.treino.fase === fase && sessao.treino.nivel === nivel)
    .sort((a, b) => a.dataInicio.getTime() - b.dataInicio.getTime());

  return sessoesDoNivel[0] ?? null;
}

/**
 * Calcula, para o grupo de participantes informado, quantos progrediram de fase
 * (Iniciante → Intermediário e Intermediário → Avançado) dentro do período filtrado,
 * o % sobre o total de participantes que já passaram por aquela fase (em qualquer
 * momento) e o tempo médio (em semanas) do primeiro treino do nível 1 até a
 * conclusão do nível 2 daquela fase — essa média considera todo o histórico (não só
 * o período), pois é uma métrica de "quanto tempo leva", não "quantos no período".
 */
export function calcularProgressaoFase(
  participantes: { sessoes: SessaoProgressao[] }[],
  periodoInicio: Date,
  periodoFim: Date,
): ProgressaoFaseResultado {
  let totalJaFoiIniciante = 0;
  let totalJaFoiIntermediario = 0;
  let progredirosIniInt = 0;
  let progredirosIntAva = 0;
  const semanasAteIntermediario: number[] = [];
  const semanasAteAvancado: number[] = [];

  for (const participante of participantes) {
    const sessoesOrdenadas = [...participante.sessoes].sort(
      (a, b) => a.dataInicio.getTime() - b.dataInicio.getTime(),
    );

    const nivelKeys = new Set(
      sessoesOrdenadas.map((sessao) => chaveNivel(sessao.treino.fase, sessao.treino.nivel)),
    );

    const jaFoiIniciante =
      nivelKeys.has(chaveNivel(FaseTreino.INICIANTE, 1)) || nivelKeys.has(chaveNivel(FaseTreino.INICIANTE, 2));
    const jaFoiIntermediario =
      nivelKeys.has(chaveNivel(FaseTreino.INTERMEDIARIO, 1)) ||
      nivelKeys.has(chaveNivel(FaseTreino.INTERMEDIARIO, 2));

    if (jaFoiIniciante) totalJaFoiIniciante += 1;
    if (jaFoiIntermediario) totalJaFoiIntermediario += 1;

    const conclusaoIniNivel2 = encontrarSessaoDeConclusao(sessoesOrdenadas, FaseTreino.INICIANTE, 2);
    if (conclusaoIniNivel2) {
      const primeiraIniNivel1 = primeiraSessaoDoNivel(sessoesOrdenadas, FaseTreino.INICIANTE, 1);
      if (primeiraIniNivel1) {
        const semanas = (conclusaoIniNivel2.dataInicio.getTime() - primeiraIniNivel1.dataInicio.getTime()) / UMA_SEMANA_MS;
        semanasAteIntermediario.push(Math.max(0, semanas));
      }

      if (conclusaoIniNivel2.dataInicio >= periodoInicio && conclusaoIniNivel2.dataInicio < periodoFim) {
        progredirosIniInt += 1;
      }
    }

    const conclusaoIntNivel2 = encontrarSessaoDeConclusao(sessoesOrdenadas, FaseTreino.INTERMEDIARIO, 2);
    if (conclusaoIntNivel2) {
      const primeiraIntNivel1 = primeiraSessaoDoNivel(sessoesOrdenadas, FaseTreino.INTERMEDIARIO, 1);
      if (primeiraIntNivel1) {
        const semanas = (conclusaoIntNivel2.dataInicio.getTime() - primeiraIntNivel1.dataInicio.getTime()) / UMA_SEMANA_MS;
        semanasAteAvancado.push(Math.max(0, semanas));
      }

      if (conclusaoIntNivel2.dataInicio >= periodoInicio && conclusaoIntNivel2.dataInicio < periodoFim) {
        progredirosIntAva += 1;
      }
    }
  }

  const media = (valores: number[]): number =>
    valores.length > 0 ? Math.round(valores.reduce((soma, v) => soma + v, 0) / valores.length) : 0;

  return {
    iniciantesParaIntermediario: progredirosIniInt,
    iniciantesParaIntermediarioPct:
      totalJaFoiIniciante > 0 ? Math.round((progredirosIniInt / totalJaFoiIniciante) * 100) : 0,
    intermediariosParaAvancado: progredirosIntAva,
    intermediariosParaAvancadoPct:
      totalJaFoiIntermediario > 0 ? Math.round((progredirosIntAva / totalJaFoiIntermediario) * 100) : 0,
    semanasMediasAteIntermediario: media(semanasAteIntermediario),
    semanasMediasAteAvancado: media(semanasAteAvancado),
  };
}
