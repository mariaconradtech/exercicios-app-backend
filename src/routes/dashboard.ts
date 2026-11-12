import { Router } from 'express';

import { prisma } from '../prismaClient';
import { FaseTreino, Sexo, StatusSessao } from '../../generated/prisma/client';
import {
  PERCENTUAL_MINIMO_PARA_CONTAR,
  filtroSessoesQueContam,
  inicioDaSemana,
} from '../services/gamificacao';
import { calcularProgressaoFase } from '../services/progressaoFase';
import { classificarFaixaIntensidade, FAIXAS_INTENSIDADE, FaixaIntensidade } from '../services/esforco';
import { calcularIdade, classificarFaixaEtaria, FAIXAS_ETARIAS, FaixaEtaria } from '../utils/idade';

export const dashboardRouter = Router();

// ---------------------------------------------------------------------------
// Tipos e constantes locais
// ---------------------------------------------------------------------------

type Fase = 'iniciante' | 'intermediario' | 'avancado';
type FaixaEsforcoWeb = 'leve' | 'moderada' | 'vigorosa';

const FASE_PARA_WEB: Record<FaseTreino, Fase> = {
  [FaseTreino.INICIANTE]: 'iniciante',
  [FaseTreino.INTERMEDIARIO]: 'intermediario',
  [FaseTreino.AVANCADO]: 'avancado',
};

const FASES: FaseTreino[] = [FaseTreino.INICIANTE, FaseTreino.INTERMEDIARIO, FaseTreino.AVANCADO];

const FAIXA_INTENSIDADE_PARA_WEB: Record<FaixaIntensidade, FaixaEsforcoWeb> = {
  LEVE: 'leve',
  MODERADA: 'moderada',
  VIGOROSA: 'vigorosa',
};

const PERIODOS_VALIDOS = [7, 30, 90, 365] as const;
type PeriodoDias = (typeof PERIODOS_VALIDOS)[number];

const MAXIMO_SEMANAS_GRAFICO = 8;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const UMA_SEMANA_MS = 7 * UM_DIA_MS;

type SessaoDashboard = {
  id: number;
  dataInicio: Date;
  status: StatusSessao;
  percentualConcluido: number;
  esforcoOmni: number | null;
  treino: {
    fase: FaseTreino;
    nivel: number;
    quantidadeSemanas: number;
  };
};

type ParticipanteDashboard = {
  id: number;
  nome: string;
  dataAdesao: Date;
  dataNascimento: Date | null;
  sexo: Sexo | null;
  faseAtual: FaseTreino;
  sessoes: SessaoDashboard[];
};

function sessaoConta(sessao: SessaoDashboard): boolean {
  return (
    sessao.status === StatusSessao.CONCLUIDA ||
    (sessao.status === StatusSessao.INTERROMPIDA && sessao.percentualConcluido >= PERCENTUAL_MINIMO_PARA_CONTAR)
  );
}

function formatarDataCurta(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}

// ---------------------------------------------------------------------------
// Leitura e validação dos filtros globais
// ---------------------------------------------------------------------------

interface FiltrosDashboard {
  periodoDias: PeriodoDias;
  sexo: 'todos' | 'feminino' | 'masculino';
  faixaEtaria: 'todas' | FaixaEtaria;
}

function lerFiltros(query: Record<string, unknown>): FiltrosDashboard | { erro: string } {
  const periodoQuery = query.periodoDias !== undefined ? Number(query.periodoDias) : 30;
  if (!PERIODOS_VALIDOS.includes(periodoQuery as PeriodoDias)) {
    return { erro: 'periodoDias deve ser 7, 30, 90 ou 365' };
  }

  const sexoQuery = typeof query.sexo === 'string' ? query.sexo : 'todos';
  if (sexoQuery !== 'todos' && sexoQuery !== 'feminino' && sexoQuery !== 'masculino') {
    return { erro: 'sexo deve ser "todos", "feminino" ou "masculino"' };
  }

  const faixaEtariaQuery = typeof query.faixaEtaria === 'string' ? query.faixaEtaria : 'todas';
  if (faixaEtariaQuery !== 'todas' && !FAIXAS_ETARIAS.includes(faixaEtariaQuery as FaixaEtaria)) {
    return { erro: 'faixaEtaria inválida' };
  }

  return {
    periodoDias: periodoQuery as PeriodoDias,
    sexo: sexoQuery,
    faixaEtaria: faixaEtariaQuery as 'todas' | FaixaEtaria,
  };
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

function calcularKpis(
  participantes: ParticipanteDashboard[],
  periodoInicio: Date,
  periodoFim: Date,
  agora: Date,
) {
  const numSemanas = (periodoFim.getTime() - periodoInicio.getTime()) / UMA_SEMANA_MS;

  const totalParticipantes = participantes.length;

  const umMesAtras = new Date(agora.getTime() - 30 * UM_DIA_MS);
  const totalHaUmMes = participantes.filter((p) => p.dataAdesao.getTime() <= umMesAtras.getTime()).length;
  const variacaoTotalMensalPct =
    totalHaUmMes > 0
      ? Math.round(((totalParticipantes - totalHaUmMes) / totalHaUmMes) * 100)
      : totalParticipantes > 0
        ? 100
        : 0;

  const idades = participantes
    .filter((p) => p.dataNascimento !== null)
    .map((p) => calcularIdade(p.dataNascimento as Date, agora));
  const mediaIdade = idades.length > 0 ? Math.round(idades.reduce((s, v) => s + v, 0) / idades.length) : null;

  const participantesAtivos = participantes.filter((p) =>
    p.sessoes.some((s) => sessaoConta(s) && s.dataInicio >= periodoInicio && s.dataInicio < periodoFim),
  ).length;

  function taxaAdesaoNoPeriodo(inicio: Date, fim: Date): { taxaPct: number; sessoesContadas: number } {
    const semanas = (fim.getTime() - inicio.getTime()) / UMA_SEMANA_MS;
    if (totalParticipantes === 0 || semanas <= 0) {
      return { taxaPct: 0, sessoesContadas: 0 };
    }
    let sessoesContadas = 0;
    for (const participante of participantes) {
      sessoesContadas += participante.sessoes.filter(
        (s) => sessaoConta(s) && s.dataInicio >= inicio && s.dataInicio < fim,
      ).length;
    }
    const metaTotal = totalParticipantes * semanas * 3;
    const taxaPct = metaTotal > 0 ? Math.min(100, Math.round((sessoesContadas / metaTotal) * 100)) : 0;
    return { taxaPct, sessoesContadas };
  }

  const { taxaPct: taxaAdesaoPct, sessoesContadas: sessoesNoPeriodo } = taxaAdesaoNoPeriodo(periodoInicio, periodoFim);

  const periodoAnteriorFim = periodoInicio;
  const periodoAnteriorInicio = new Date(periodoInicio.getTime() - (periodoFim.getTime() - periodoInicio.getTime()));
  const { taxaPct: taxaAdesaoAnteriorPct } = taxaAdesaoNoPeriodo(periodoAnteriorInicio, periodoAnteriorFim);
  const variacaoAdesaoPp = taxaAdesaoPct - taxaAdesaoAnteriorPct;

  const frequenciaSemanal =
    totalParticipantes > 0 && numSemanas > 0
      ? Number((sessoesNoPeriodo / totalParticipantes / numSemanas).toFixed(1))
      : 0;

  let sessoesFinalizadas = 0;
  let sessoesFinalizadasQueContam = 0;
  for (const participante of participantes) {
    for (const sessao of participante.sessoes) {
      if (sessao.status === StatusSessao.EM_ANDAMENTO) continue;
      if (sessao.dataInicio < periodoInicio || sessao.dataInicio >= periodoFim) continue;
      sessoesFinalizadas += 1;
      if (sessaoConta(sessao)) sessoesFinalizadasQueContam += 1;
    }
  }
  const treinosConcluidosPct =
    sessoesFinalizadas > 0 ? Math.round((sessoesFinalizadasQueContam / sessoesFinalizadas) * 100) : 0;
  const treinosInterrompidosPct = sessoesFinalizadas > 0 ? 100 - treinosConcluidosPct : 0;

  return {
    totalParticipantes,
    variacaoTotalMensalPct,
    participantesAtivos,
    mediaIdade,
    taxaAdesaoPct,
    variacaoAdesaoPp,
    frequenciaSemanal,
    treinosConcluidosPct,
    treinosInterrompidosPct,
  };
}

// ---------------------------------------------------------------------------
// Evolução da percepção de esforço (PSE média por semana, por fase)
// ---------------------------------------------------------------------------

function calcularEvolucaoPse(participantes: ParticipanteDashboard[], periodoDias: PeriodoDias, agora: Date) {
  const numSemanas = Math.min(MAXIMO_SEMANAS_GRAFICO, Math.max(1, Math.ceil(periodoDias / 7)));
  const semanaAtualInicio = inicioDaSemana(agora);

  const inicioSemanas: Date[] = [];
  for (let i = numSemanas - 1; i >= 0; i -= 1) {
    inicioSemanas.push(new Date(semanaAtualInicio.getTime() - i * UMA_SEMANA_MS));
  }
  const semanas = inicioSemanas.map((data) => formatarDataCurta(data));

  const series = FASES.map((fase) => {
    const participantesDaFase = participantes.filter((p) => p.faseAtual === fase);
    if (participantesDaFase.length === 0) {
      return null;
    }

    const respostasPorSemana: number[][] = inicioSemanas.map(() => []);
    for (const participante of participantesDaFase) {
      for (const sessao of participante.sessoes) {
        if (typeof sessao.esforcoOmni !== 'number') continue;
        for (let indice = 0; indice < inicioSemanas.length; indice += 1) {
          const inicioSemana = inicioSemanas[indice];
          const fimSemana = new Date(inicioSemana.getTime() + UMA_SEMANA_MS);
          if (sessao.dataInicio >= inicioSemana && sessao.dataInicio < fimSemana) {
            respostasPorSemana[indice].push(sessao.esforcoOmni);
            break;
          }
        }
      }
    }

    const mediaGeral = (() => {
      const todas = respostasPorSemana.flat();
      return todas.length > 0 ? todas.reduce((s, v) => s + v, 0) / todas.length : 5;
    })();

    let ultimoValor = mediaGeral;
    const valores = respostasPorSemana.map((respostas) => {
      if (respostas.length > 0) {
        ultimoValor = Number((respostas.reduce((s, v) => s + v, 0) / respostas.length).toFixed(1));
      }
      return ultimoValor;
    });

    return { fase: FASE_PARA_WEB[fase], valores };
  }).filter((serie): serie is { fase: Fase; valores: number[] } => serie !== null);

  const leitura = montarLeituraEvolucaoPse(series);

  return { semanas, series, leitura };
}

function montarLeituraEvolucaoPse(series: { fase: Fase; valores: number[] }[]): string {
  const ROTULO_FASE: Record<Fase, string> = {
    iniciante: 'Iniciantes',
    intermediario: 'Intermediários',
    avancado: 'Avançados',
  };

  const candidatos = series
    .filter((serie) => serie.valores.length >= 2)
    .map((serie) => ({
      fase: serie.fase,
      primeiro: serie.valores[0],
      ultimo: serie.valores[serie.valores.length - 1],
      variacao: serie.valores[serie.valores.length - 1] - serie.valores[0],
    }));

  if (candidatos.length === 0) {
    return 'Ainda não há respostas de percepção de esforço suficientes no período selecionado.';
  }

  const maiorVariacao = candidatos.reduce((maior, atual) =>
    Math.abs(atual.variacao) > Math.abs(maior.variacao) ? atual : maior,
  );

  if (Math.abs(maiorVariacao.variacao) < 0.1) {
    return 'A percepção de esforço se manteve estável em todas as fases no período selecionado.';
  }

  const direcao = maiorVariacao.variacao < 0 ? 'caiu' : 'subiu';
  return `${ROTULO_FASE[maiorVariacao.fase]} ${direcao} de ${maiorVariacao.primeiro.toFixed(1).replace('.', ',')} para ${maiorVariacao.ultimo.toFixed(1).replace('.', ',')} de PSE média no período analisado.`;
}

// ---------------------------------------------------------------------------
// Alerta de esforço (sem CRUD — faixas de intensidade calculadas em código)
// ---------------------------------------------------------------------------

function calcularAlertaEsforco(participantes: ParticipanteDashboard[], periodoInicio: Date, periodoFim: Date) {
  const participantesPorFaixa: Record<FaixaIntensidade, Map<number, string>> = {
    LEVE: new Map(),
    MODERADA: new Map(),
    VIGOROSA: new Map(),
  };
  const totalRespostasPorFaixa: Record<FaixaIntensidade, number> = { LEVE: 0, MODERADA: 0, VIGOROSA: 0 };
  let totalRespostas = 0;

  for (const participante of participantes) {
    for (const sessao of participante.sessoes) {
      if (typeof sessao.esforcoOmni !== 'number') continue;
      if (sessao.dataInicio < periodoInicio || sessao.dataInicio >= periodoFim) continue;

      const faixa = classificarFaixaIntensidade(sessao.esforcoOmni);
      if (!faixa) continue;

      totalRespostas += 1;
      totalRespostasPorFaixa[faixa] += 1;
      participantesPorFaixa[faixa].set(participante.id, participante.nome);
    }
  }

  const porIntensidade = FAIXAS_INTENSIDADE.map((faixa) => ({
    nivel: FAIXA_INTENSIDADE_PARA_WEB[faixa],
    participantes: [...participantesPorFaixa[faixa].entries()]
      .map(([participanteId, nome]) => ({ participanteId, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  }));

  let faixaMaisRespondida: FaixaEsforcoWeb | null = null;
  let maiorContagem = 0;
  for (const faixa of FAIXAS_INTENSIDADE) {
    if (totalRespostasPorFaixa[faixa] > maiorContagem) {
      maiorContagem = totalRespostasPorFaixa[faixa];
      faixaMaisRespondida = FAIXA_INTENSIDADE_PARA_WEB[faixa];
    }
  }

  return { porIntensidade, faixaMaisRespondida, totalRespostas };
}

// ---------------------------------------------------------------------------
// Distribuições demográficas
// ---------------------------------------------------------------------------

function calcularDistribuicaoSexo(participantes: ParticipanteDashboard[]) {
  let feminino = 0;
  let masculino = 0;
  for (const participante of participantes) {
    if (participante.sexo === Sexo.FEMININO) feminino += 1;
    if (participante.sexo === Sexo.MASCULINO) masculino += 1;
  }
  return { feminino, masculino };
}

function calcularDistribuicaoIdade(participantes: ParticipanteDashboard[], agora: Date) {
  const comIdade = participantes.filter((p) => p.dataNascimento !== null);
  if (comIdade.length === 0) {
    return [];
  }

  const contagem = new Map<FaixaEtaria, number>(FAIXAS_ETARIAS.map((faixa) => [faixa, 0]));
  for (const participante of comIdade) {
    const idade = calcularIdade(participante.dataNascimento as Date, agora);
    const faixa = classificarFaixaEtaria(idade);
    if (faixa) {
      contagem.set(faixa, (contagem.get(faixa) ?? 0) + 1);
    }
  }

  return FAIXAS_ETARIAS.map((faixa) => ({ faixa, participantes: contagem.get(faixa) ?? 0 }));
}

function calcularAdesaoPorFaixaEtaria(
  participantes: ParticipanteDashboard[],
  periodoInicio: Date,
  periodoFim: Date,
  agora: Date,
) {
  const comIdade = participantes.filter((p) => p.dataNascimento !== null);
  if (comIdade.length === 0) {
    return [];
  }

  const numSemanas = (periodoFim.getTime() - periodoInicio.getTime()) / UMA_SEMANA_MS;
  const porFaixa = new Map<FaixaEtaria, ParticipanteDashboard[]>();

  for (const participante of comIdade) {
    const idade = calcularIdade(participante.dataNascimento as Date, agora);
    const faixa = classificarFaixaEtaria(idade);
    if (!faixa) continue;
    porFaixa.set(faixa, [...(porFaixa.get(faixa) ?? []), participante]);
  }

  const resultado: { faixa: FaixaEtaria; taxaAdesaoPct: number }[] = [];
  for (const faixa of FAIXAS_ETARIAS) {
    const grupo = porFaixa.get(faixa);
    if (!grupo || grupo.length === 0 || numSemanas <= 0) continue;

    let sessoesContadas = 0;
    for (const participante of grupo) {
      sessoesContadas += participante.sessoes.filter(
        (s) => sessaoConta(s) && s.dataInicio >= periodoInicio && s.dataInicio < periodoFim,
      ).length;
    }
    const metaTotal = grupo.length * numSemanas * 3;
    const taxaAdesaoPct = metaTotal > 0 ? Math.min(100, Math.round((sessoesContadas / metaTotal) * 100)) : 0;
    resultado.push({ faixa, taxaAdesaoPct });
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Distribuição por fase + percepção de esforço dentro de cada fase
// ---------------------------------------------------------------------------

function calcularFasesEsforco(participantes: ParticipanteDashboard[], periodoInicio: Date, periodoFim: Date) {
  return FASES.map((fase) => {
    const participantesDaFase = participantes.filter((p) => p.faseAtual === fase);

    const contagemPorFaixa: Record<FaixaIntensidade, number> = { LEVE: 0, MODERADA: 0, VIGOROSA: 0 };
    for (const participante of participantesDaFase) {
      const sessoesComResposta = participante.sessoes
        .filter(
          (s) =>
            typeof s.esforcoOmni === 'number' && s.dataInicio >= periodoInicio && s.dataInicio < periodoFim,
        )
        .sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime());

      const maisRecente = sessoesComResposta[0];
      if (!maisRecente) continue;

      const faixa = classificarFaixaIntensidade(maisRecente.esforcoOmni as number);
      if (faixa) contagemPorFaixa[faixa] += 1;
    }

    return {
      fase: FASE_PARA_WEB[fase],
      participantes: participantesDaFase.length,
      porEsforco: FAIXAS_INTENSIDADE.map((faixa) => ({
        faixa: FAIXA_INTENSIDADE_PARA_WEB[faixa],
        participantes: contagemPorFaixa[faixa],
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Rota
// ---------------------------------------------------------------------------

dashboardRouter.get('/', async (req, res) => {
  const filtros = lerFiltros(req.query as Record<string, unknown>);
  if ('erro' in filtros) {
    res.status(400).json({ error: filtros.erro });
    return;
  }

  try {
    const agora = new Date();
    const periodoFim = agora;
    const periodoInicio = new Date(agora.getTime() - filtros.periodoDias * UM_DIA_MS);

    const todosParticipantes = await prisma.participante.findMany({
      include: {
        usuario: { select: { nome: true } },
        perfil: { select: { faseAtual: true } },
        sessoes: {
          select: {
            id: true,
            dataInicio: true,
            status: true,
            percentualConcluido: true,
            esforcoOmni: true,
            treino: { select: { fase: true, nivel: true, quantidadeSemanas: true } },
          },
        },
      },
    });

    const participantesMapeados: ParticipanteDashboard[] = todosParticipantes.map((p) => ({
      id: p.id,
      nome: p.usuario.nome,
      dataAdesao: p.dataAdesao,
      dataNascimento: p.dataNascimento,
      sexo: p.sexo,
      faseAtual: p.perfil?.faseAtual ?? FaseTreino.INICIANTE,
      sessoes: p.sessoes,
    }));

    const participantesFiltrados = participantesMapeados.filter((participante) => {
      if (filtros.sexo !== 'todos') {
        const sexoEsperado = filtros.sexo === 'feminino' ? Sexo.FEMININO : Sexo.MASCULINO;
        if (participante.sexo !== sexoEsperado) return false;
      }

      if (filtros.faixaEtaria !== 'todas') {
        if (!participante.dataNascimento) return false;
        const idade = calcularIdade(participante.dataNascimento, agora);
        if (classificarFaixaEtaria(idade) !== filtros.faixaEtaria) return false;
      }

      return true;
    });

    res.json({
      kpis: calcularKpis(participantesFiltrados, periodoInicio, periodoFim, agora),
      evolucaoPse: calcularEvolucaoPse(participantesFiltrados, filtros.periodoDias, agora),
      alertasEsforco: calcularAlertaEsforco(participantesFiltrados, periodoInicio, periodoFim),
      distribuicaoSexo: calcularDistribuicaoSexo(participantesFiltrados),
      distribuicaoIdade: calcularDistribuicaoIdade(participantesFiltrados, agora),
      adesaoPorFaixaEtaria: calcularAdesaoPorFaixaEtaria(participantesFiltrados, periodoInicio, periodoFim, agora),
      fasesEsforco: calcularFasesEsforco(participantesFiltrados, periodoInicio, periodoFim),
      progressaoFase: calcularProgressaoFase(participantesFiltrados, periodoInicio, periodoFim),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
