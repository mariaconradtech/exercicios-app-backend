import 'dotenv/config';

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, StatusSessao } from './generated/prisma/client.ts';

const port = Number(process.env.PORT ?? 3000);
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://postgres:rootpassword@localhost:5433/meraki?schema=public';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

type FeedbackPayload = {
  rating?: unknown;
  sessionId?: unknown;
  participanteId?: unknown;
  treinoId?: unknown;
};

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJson(response: ServerResponse<IncomingMessage>, statusCode: number, body: unknown) {
  response.writeHead(statusCode, jsonHeaders);
  response.end(JSON.stringify(body));
}

function parseInteger(value: unknown) {
  const numericValue = typeof value === 'string' ? Number(value) : value;
  return typeof numericValue === 'number' && Number.isInteger(numericValue) ? numericValue : null;
}

async function resolveSessao(payload: FeedbackPayload) {
  const sessionId = parseInteger(payload.sessionId);
  const participanteId = parseInteger(payload.participanteId);
  const treinoId = parseInteger(payload.treinoId);

  if (sessionId !== null) {
    const sessao = await prisma.sessaoTreino.findUnique({ where: { id: sessionId } });

    if (sessao) {
      return sessao;
    }
  }

  if (participanteId !== null && treinoId !== null) {
    const sessao = await prisma.sessaoTreino.findFirst({
      where: { participanteId, treinoId },
      orderBy: { dataInicio: 'desc' },
    });

    if (sessao) {
      return sessao;
    }
  }

  const sessaoAberta = await prisma.sessaoTreino.findFirst({
    where: { status: StatusSessao.EM_ANDAMENTO },
    orderBy: { dataInicio: 'desc' },
  });

  if (sessaoAberta) {
    return sessaoAberta;
  }

  return prisma.sessaoTreino.findFirst({ orderBy: { dataInicio: 'desc' } });
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Requisicao invalida.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, jsonHeaders);
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/avaliacoes') {
    sendJson(response, 404, { error: 'Rota nao encontrada.' });
    return;
  }

  try {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const rawBody = Buffer.concat(chunks).toString('utf-8');
    const payload = rawBody ? (JSON.parse(rawBody) as FeedbackPayload) : {};
    const rating = parseInteger(payload.rating);

    if (rating === null || rating < 0 || rating > 10) {
      sendJson(response, 400, { error: 'A nota do feedback deve ser um numero inteiro entre 0 e 10.' });
      return;
    }

    const sessao = await resolveSessao(payload);

    if (!sessao) {
      const participanteId = parseInteger(payload.participanteId);
      const treinoId = parseInteger(payload.treinoId);

      if (participanteId === null || treinoId === null) {
        sendJson(response, 404, {
          error: 'Nenhuma sessao de treino encontrada para atualizar. Envie sessionId, participanteId e treinoId.',
        });
        return;
      }

      const criada = await prisma.sessaoTreino.create({
        data: {
          participanteId,
          treinoId,
          status: StatusSessao.CONCLUIDA,
          dataFim: new Date(),
          percentualConcluido: 100,
          esforcoOmni: rating,
        },
      });

      sendJson(response, 201, { message: 'Feedback salvo com sucesso.', sessao: criada });
      return;
    }

    const atualizada = await prisma.sessaoTreino.update({
      where: { id: sessao.id },
      data: {
        esforcoOmni: rating,
        status: StatusSessao.CONCLUIDA,
        dataFim: sessao.dataFim ?? new Date(),
      },
    });

    sendJson(response, 200, { message: 'Feedback salvo com sucesso.', sessao: atualizada });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao salvar feedback.';
    sendJson(response, 500, { error: message });
  }
});

server.listen(port, () => {
  console.log(`API de feedback rodando em http://localhost:${port}`);
});