import { Router } from 'express';

import { prisma } from '../prismaClient';
import { Prisma } from '../../generated/prisma/client';
import { obterPesquisadorPadraoId } from '../pesquisadorPadrao';
import { montarUrlVideo, removerArquivoVideo, uploadVideo } from '../uploads';

export const exerciciosRouter = Router();

function parseInstrucao(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor.map(String);
  }

  if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      // Não é JSON: trata o próprio texto como uma instrução única.
    }
    return valor.trim() ? [valor.trim()] : [];
  }

  return [];
}

exerciciosRouter.get('/', async (req, res) => {
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
    const categoriaId = req.query.categoriaId ? Number(req.query.categoriaId) : undefined;

    const exercicios = await prisma.exercicio.findMany({
      where: {
        ...(busca ? { nome: { contains: busca, mode: 'insensitive' as const } } : {}),
        ...(categoriaId ? { categoriaId } : {}),
      },
      orderBy: { id: 'asc' },
    });

    res.json(exercicios);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

exerciciosRouter.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const exercicio = await prisma.exercicio.findUnique({ where: { id } });
    if (!exercicio) {
      res.status(404).json({ error: 'Exercício não encontrado' });
      return;
    }
    res.json(exercicio);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

exerciciosRouter.post('/', uploadVideo.single('video'), async (req, res) => {
  try {
    const { nome, categoriaId, nivel } = req.body as { nome?: string; categoriaId?: string; nivel?: string };

    if (!nome || !nome.trim()) {
      res.status(400).json({ error: 'nome é obrigatório' });
      return;
    }
    if (!categoriaId) {
      res.status(400).json({ error: 'categoriaId é obrigatório' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'vídeo é obrigatório' });
      return;
    }

    const pesquisadorId = await obterPesquisadorPadraoId();
    const videoUrl = montarUrlVideo(req, req.file.filename);

    const exercicio = await prisma.exercicio.create({
      data: {
        pesquisadorId,
        categoriaId: Number(categoriaId),
        nome: nome.trim(),
        nivel: nivel ? Number(nivel) : 1,
        videoUrl,
        instrucao: parseInstrucao(req.body.instrucao),
      },
    });

    res.status(201).json(exercicio);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(400).json({ error: 'Categoria informada não existe' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

exerciciosRouter.patch('/:id', uploadVideo.single('video'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nome, categoriaId, nivel } = req.body as { nome?: string; categoriaId?: string; nivel?: string };

    const existente = await prisma.exercicio.findUnique({ where: { id } });
    if (!existente) {
      res.status(404).json({ error: 'Exercício não encontrado' });
      return;
    }

    let videoUrl = existente.videoUrl;
    if (req.file) {
      videoUrl = montarUrlVideo(req, req.file.filename);
      removerArquivoVideo(existente.videoUrl);
    }

    const exercicio = await prisma.exercicio.update({
      where: { id },
      data: {
        ...(nome ? { nome: nome.trim() } : {}),
        ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
        ...(nivel ? { nivel: Number(nivel) } : {}),
        ...(req.body.instrucao !== undefined ? { instrucao: parseInstrucao(req.body.instrucao) } : {}),
        videoUrl,
      },
    });

    res.json(exercicio);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(400).json({ error: 'Categoria informada não existe' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

exerciciosRouter.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existente = await prisma.exercicio.findUnique({ where: { id } });
    if (!existente) {
      res.status(404).json({ error: 'Exercício não encontrado' });
      return;
    }

    await prisma.exercicio.delete({ where: { id } });
    removerArquivoVideo(existente.videoUrl);
    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(409).json({ error: 'Não é possível excluir: existem treinos ou sessões usando esse exercício' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
