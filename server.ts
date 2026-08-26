process.env.TZ = process.env.TZ ?? 'America/Sao_Paulo';

import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { prisma } from './src/prismaClient';
import { autenticacaoRouter } from './src/routes/autenticacao';
import { participantesRouter } from './src/routes/participantes';
import { treinosRouter } from './src/routes/treinos';
import { sessoesRouter } from './src/routes/sessoes';
import { StatusSessao } from './generated/prisma/client';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use(autenticacaoRouter);
app.use('/participantes', participantesRouter);
app.use('/treinos', treinosRouter);
app.use('/sessoes', sessoesRouter);

app.post('/avaliacoes', async (req, res) => {
  try {
    const { rating, sessionId, participanteId, treinoId } = req.body as {
      rating?: unknown;
      sessionId?: unknown;
      participanteId?: unknown;
      treinoId?: unknown;
    };

    const parseInteger = (value: unknown) => {
      const numericValue = typeof value === 'string' ? Number(value) : value;
      return typeof numericValue === 'number' && Number.isInteger(numericValue) ? numericValue : null;
    };

    const ratingNum = parseInteger(rating);

    if (ratingNum === null || ratingNum < 0 || ratingNum > 10) {
      return res
        .status(400)
        .json({ error: 'A nota do feedback deve ser um numero inteiro entre 0 e 10.' });
    }

    const sessionIdNum = parseInteger(sessionId);
    const participanteIdNum = parseInteger(participanteId);
    const treinoIdNum = parseInteger(treinoId);

    let sessao;

    if (sessionIdNum !== null) {
      sessao = await prisma.sessaoTreino.findUnique({ where: { id: sessionIdNum } });
    } else if (participanteIdNum !== null && treinoIdNum !== null) {
      sessao = await prisma.sessaoTreino.findFirst({
        where: { participanteId: participanteIdNum, treinoId: treinoIdNum },
        orderBy: { dataInicio: 'desc' },
      });
    }

    if (!sessao) {
      if (participanteIdNum === null || treinoIdNum === null) {
        return res.status(400).json({
          error: 'Parametros invalidos. Envie sessionId, participanteId e treinoId.',
        });
      }

      const criada = await prisma.sessaoTreino.create({
        data: {
          participanteId: participanteIdNum,
          treinoId: treinoIdNum,
          status: StatusSessao.CONCLUIDA,
          dataFim: new Date(),
          percentualConcluido: 100,
          esforcoOmni: ratingNum,
        },
      });

      return res.status(201).json({ message: 'Feedback salvo com sucesso.', sessao: criada });
    }

    const atualizada = await prisma.sessaoTreino.update({
      where: { id: sessao.id },
      data: {
        esforcoOmni: ratingNum,
        status: StatusSessao.CONCLUIDA,
        dataFim: sessao.dataFim ?? new Date(),
      },
    });

    res.status(200).json({ message: 'Feedback salvo com sucesso.', sessao: atualizada });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao salvar feedback.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`API rodando em http://localhost:${port}`);
});