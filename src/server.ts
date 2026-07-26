import 'dotenv/config';
import cors from 'cors';
import express from 'express';

import { sessoesRouter } from './routes/sessoes';
import { treinosRouter } from './routes/treinos';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/treinos', treinosRouter);
app.use('/sessoes', sessoesRouter);

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
