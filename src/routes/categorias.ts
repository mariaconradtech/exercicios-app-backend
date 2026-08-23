import { Router } from 'express';

import { prisma } from '../prismaClient';
import { Prisma } from '../../generated/prisma/client';

export const categoriasRouter = Router();

categoriasRouter.get('/', async (req, res) => {
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';

    const categorias = await prisma.categoria.findMany({
      where: busca ? { nome: { contains: busca, mode: 'insensitive' } } : undefined,
      orderBy: { nome: 'asc' },
    });

    res.json(categorias);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

categoriasRouter.post('/', async (req, res) => {
  try {
    const { nome } = req.body as { nome?: string };
    if (!nome || !nome.trim()) {
      res.status(400).json({ error: 'nome é obrigatório' });
      return;
    }

    const categoria = await prisma.categoria.create({ data: { nome: nome.trim() } });
    res.status(201).json(categoria);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Já existe uma categoria com esse nome' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

categoriasRouter.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nome } = req.body as { nome?: string };
    if (!nome || !nome.trim()) {
      res.status(400).json({ error: 'nome é obrigatório' });
      return;
    }

    const categoria = await prisma.categoria.update({ where: { id }, data: { nome: nome.trim() } });
    res.json(categoria);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'Categoria não encontrada' });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Já existe uma categoria com esse nome' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

categoriasRouter.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.categoria.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'Categoria não encontrada' });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(409).json({ error: 'Não é possível excluir: existem exercícios nessa categoria' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
