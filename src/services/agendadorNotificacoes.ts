/**
 * Agendador das notificações push "fora do app" (lembrete padrão, lembrete
 * repetido e lembrete semanal). Roda dentro do próprio processo do backend,
 * a cada 15 minutos, usando node-cron. Não existe nenhuma tela para o
 * participante configurar horário — os horários são globais, definidos por
 * variáveis de ambiente (com um valor padrão sensato), conforme decisão da
 * pesquisadora.
 *
 * Regras (documento "Mensagens para o app TecnoAging"):
 *   1. Lembrete padrão: enviado uma vez por dia, no horário configurado, para
 *      quem ainda não treinou nesse dia.
 *   2. Lembrete repetido: enviado algumas horas depois do lembrete padrão
 *      (intervalo configurável, padrão 4h), se o treino ainda não foi
 *      realizado.
 *   3. Lembrete semanal: enviado uma vez por semana (padrão: domingo às 18h)
 *      para quem não realizou nenhum treino na semana. Reaproveita o mesmo
 *      banco de mensagens do lembrete repetido, pois o documento não traz um
 *      texto próprio para esse caso.
 */
import cron from 'node-cron';
import type { PrismaClient } from '../../generated/prisma/client';

import { filtroSessoesQueContam, inicioDaSemana } from './gamificacao';
import {
  escolherMensagemAleatoria,
  MENSAGENS_LEMBRETE_PADRAO,
  MENSAGENS_LEMBRETE_REPETIDO,
} from './mensagens';
import { enviarNotificacoesPush, tokenPushValido, type MensagemPush } from './pushNotifications';

const FUSO_HORARIO = 'America/Sao_Paulo';
const TITULO_LEMBRETE = 'TecnoAging';

const HORA_LEMBRETE_PADRAO = Number(process.env.LEMBRETE_PADRAO_HORA ?? 9);
const MINUTO_LEMBRETE_PADRAO = Number(process.env.LEMBRETE_PADRAO_MINUTO ?? 0);
const HORAS_PARA_LEMBRETE_REPETIDO = Number(process.env.LEMBRETE_REPETIDO_HORAS_DEPOIS ?? 4);
const DIA_SEMANA_LEMBRETE_SEMANAL = Number(process.env.LEMBRETE_SEMANAL_DIA_SEMANA ?? 0); // 0 = domingo
const HORA_LEMBRETE_SEMANAL = Number(process.env.LEMBRETE_SEMANAL_HORA ?? 18);
const MINUTO_LEMBRETE_SEMANAL = Number(process.env.LEMBRETE_SEMANAL_MINUTO ?? 0);

interface HorarioLocal {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  diaDaSemana: number;
}

/**
 * Converte um instante para os componentes de data/hora no fuso de Brasília,
 * independente do fuso horário configurado no sistema operacional do
 * servidor. Evita depender de uma biblioteca externa de fuso horário.
 */
function horarioEmBrasilia(data: Date): HorarioLocal {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_HORARIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(data);

  const valorDe = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '0';
  const diasSemana: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    ano: Number(valorDe('year')),
    mes: Number(valorDe('month')),
    dia: Number(valorDe('day')),
    hora: Number(valorDe('hour')) % 24,
    minuto: Number(valorDe('minute')),
    diaDaSemana: diasSemana[valorDe('weekday')] ?? 0,
  };
}

function dataChave(horario: HorarioLocal): string {
  return `${horario.ano}-${String(horario.mes).padStart(2, '0')}-${String(horario.dia).padStart(2, '0')}`;
}

function jaOcorreuHoje(data: Date | null, agora: Date): boolean {
  if (!data) {
    return false;
  }
  return dataChave(horarioEmBrasilia(data)) === dataChave(horarioEmBrasilia(agora));
}

function jaOcorreuNestaSemana(data: Date | null, agora: Date): boolean {
  if (!data) {
    return false;
  }
  return inicioDaSemana(data).getTime() === inicioDaSemana(agora).getTime();
}

function minutosDesde(data: Date, agora: Date): number {
  return (agora.getTime() - data.getTime()) / (60 * 1000);
}

function inicioDoDiaBrasilia(horario: HorarioLocal): Date {
  // Constrói o instante correspondente a 00:00 (horário de Brasília, UTC-3)
  // do dia informado, para delimitar a janela "hoje" nas consultas ao banco.
  return new Date(Date.UTC(horario.ano, horario.mes - 1, horario.dia, 3, 0, 0));
}

type ParticipanteNotificavel = {
  id: number;
  expoPushToken: string | null;
  ultimoLembretePadraoEnviadoEm: Date | null;
  ultimoLembreteRepetidoEnviadoEm: Date | null;
  ultimoLembreteSemanalEnviadoEm: Date | null;
};

async function buscarParticipantesComTokenPush(prisma: PrismaClient): Promise<ParticipanteNotificavel[]> {
  return prisma.participante.findMany({
    where: { expoPushToken: { not: null } },
    select: {
      id: true,
      expoPushToken: true,
      ultimoLembretePadraoEnviadoEm: true,
      ultimoLembreteRepetidoEnviadoEm: true,
      ultimoLembreteSemanalEnviadoEm: true,
    },
  });
}

async function buscarIdsComTreinoNoPeriodo(
  prisma: PrismaClient,
  participanteIds: number[],
  inicioPeriodo: Date,
): Promise<Set<number>> {
  if (participanteIds.length === 0) {
    return new Set();
  }

  const sessoes = await prisma.sessaoTreino.findMany({
    where: {
      participanteId: { in: participanteIds },
      ...filtroSessoesQueContam,
      dataInicio: { gte: inicioPeriodo },
    },
    select: { participanteId: true },
  });

  return new Set(sessoes.map((sessao) => sessao.participanteId));
}

/**
 * Executa uma varredura dos participantes e dispara os lembretes que estiverem
 * no horário certo. Função pura o suficiente para ser testada isoladamente —
 * recebe `agora` para permitir simular horários diferentes em testes manuais.
 */
export async function executarVarreduraDeNotificacoes(
  prisma: PrismaClient,
  agora: Date = new Date(),
): Promise<void> {
  const horarioAtual = horarioEmBrasilia(agora);
  const participantes = await buscarParticipantesComTokenPush(prisma);

  if (participantes.length === 0) {
    return;
  }

  const inicioHoje = inicioDoDiaBrasilia(horarioAtual);
  const inicioSemanaAtual = inicioDaSemana(agora);

  const idsComTreinoHoje = await buscarIdsComTreinoNoPeriodo(
    prisma,
    participantes.map((participante) => participante.id),
    inicioHoje,
  );
  const idsComTreinoNaSemana = await buscarIdsComTreinoNoPeriodo(
    prisma,
    participantes.map((participante) => participante.id),
    inicioSemanaAtual,
  );

  const horarioPadraoJaPassou =
    horarioAtual.hora > HORA_LEMBRETE_PADRAO ||
    (horarioAtual.hora === HORA_LEMBRETE_PADRAO && horarioAtual.minuto >= MINUTO_LEMBRETE_PADRAO);

  const horarioSemanalNaJanela =
    horarioAtual.diaDaSemana === DIA_SEMANA_LEMBRETE_SEMANAL &&
    (horarioAtual.hora > HORA_LEMBRETE_SEMANAL ||
      (horarioAtual.hora === HORA_LEMBRETE_SEMANAL && horarioAtual.minuto >= MINUTO_LEMBRETE_SEMANAL));

  const mensagens: MensagemPush[] = [];
  const idsLembretePadrao: number[] = [];
  const idsLembreteRepetido: number[] = [];
  const idsLembreteSemanal: number[] = [];

  for (const participante of participantes) {
    if (!tokenPushValido(participante.expoPushToken)) {
      continue;
    }

    const treinouHoje = idsComTreinoHoje.has(participante.id);
    const treinouNaSemana = idsComTreinoNaSemana.has(participante.id);

    const padraoEnviadoHoje = jaOcorreuHoje(participante.ultimoLembretePadraoEnviadoEm, agora);
    const repetidoEnviadoHoje = jaOcorreuHoje(participante.ultimoLembreteRepetidoEnviadoEm, agora);
    const semanalEnviadoNestaSemana = jaOcorreuNestaSemana(
      participante.ultimoLembreteSemanalEnviadoEm,
      agora,
    );

    // 1) Lembrete padrão: uma vez por dia, no horário configurado, se ainda não treinou hoje.
    if (!treinouHoje && horarioPadraoJaPassou && !padraoEnviadoHoje) {
      mensagens.push({
        to: participante.expoPushToken,
        title: TITULO_LEMBRETE,
        body: escolherMensagemAleatoria(MENSAGENS_LEMBRETE_PADRAO, participante.id + horarioAtual.dia),
        data: { tipo: 'LEMBRETE_PADRAO' },
      });
      idsLembretePadrao.push(participante.id);
      continue;
    }

    // 2) Lembrete repetido: algumas horas depois do padrão, se ainda não treinou hoje.
    if (
      !treinouHoje &&
      padraoEnviadoHoje &&
      !repetidoEnviadoHoje &&
      participante.ultimoLembretePadraoEnviadoEm &&
      minutosDesde(participante.ultimoLembretePadraoEnviadoEm, agora) >= HORAS_PARA_LEMBRETE_REPETIDO * 60
    ) {
      mensagens.push({
        to: participante.expoPushToken,
        title: TITULO_LEMBRETE,
        body: escolherMensagemAleatoria(MENSAGENS_LEMBRETE_REPETIDO, participante.id + horarioAtual.dia),
        data: { tipo: 'LEMBRETE_REPETIDO' },
      });
      idsLembreteRepetido.push(participante.id);
      continue;
    }

    // 3) Lembrete semanal: uma vez por semana, se não treinou nenhuma vez na semana.
    if (!treinouNaSemana && horarioSemanalNaJanela && !semanalEnviadoNestaSemana) {
      mensagens.push({
        to: participante.expoPushToken,
        title: TITULO_LEMBRETE,
        body: escolherMensagemAleatoria(
          MENSAGENS_LEMBRETE_REPETIDO,
          participante.id + inicioSemanaAtual.getDate(),
        ),
        data: { tipo: 'LEMBRETE_SEMANAL' },
      });
      idsLembreteSemanal.push(participante.id);
    }
  }

  if (mensagens.length === 0) {
    return;
  }

  await enviarNotificacoesPush(mensagens);

  await Promise.all([
    idsLembretePadrao.length > 0
      ? prisma.participante.updateMany({
          where: { id: { in: idsLembretePadrao } },
          data: { ultimoLembretePadraoEnviadoEm: agora },
        })
      : Promise.resolve(),
    idsLembreteRepetido.length > 0
      ? prisma.participante.updateMany({
          where: { id: { in: idsLembreteRepetido } },
          data: { ultimoLembreteRepetidoEnviadoEm: agora },
        })
      : Promise.resolve(),
    idsLembreteSemanal.length > 0
      ? prisma.participante.updateMany({
          where: { id: { in: idsLembreteSemanal } },
          data: { ultimoLembreteSemanalEnviadoEm: agora },
        })
      : Promise.resolve(),
  ]);
}

let agendadorIniciado = false;

/**
 * Inicia o agendador (chamado uma vez em server.ts). A varredura roda a cada
 * 15 minutos; como cada tipo de lembrete só é enviado quando ainda não foi
 * enviado "hoje"/"nesta semana", não há risco de duplicar envios mesmo com
 * essa granularidade.
 */
export function iniciarAgendadorNotificacoes(prisma: PrismaClient): void {
  if (agendadorIniciado) {
    return;
  }
  agendadorIniciado = true;

  cron.schedule(
    '*/15 * * * *',
    () => {
      executarVarreduraDeNotificacoes(prisma).catch((error) => {
        console.error('[agendadorNotificacoes] Falha ao executar varredura de notificações:', error);
      });
    },
    { timezone: FUSO_HORARIO },
  );

  console.log(
    `[agendadorNotificacoes] Agendador iniciado (lembrete padrão às ${HORA_LEMBRETE_PADRAO}:${String(MINUTO_LEMBRETE_PADRAO).padStart(2, '0')}, repetido ${HORAS_PARA_LEMBRETE_REPETIDO}h depois, semanal no dia ${DIA_SEMANA_LEMBRETE_SEMANAL} às ${HORA_LEMBRETE_SEMANAL}:${String(MINUTO_LEMBRETE_SEMANAL).padStart(2, '0')}).`,
  );
}
