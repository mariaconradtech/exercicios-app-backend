import { Router } from 'express';

import { prisma } from '../prismaClient';

export const categoriasRouter = Router();

categoriasRouter.get('/', async (req, res) => {
  try {
    const busca = typeof req.query.busca === 'string' ? req.query.busca : undefined;

    const categorias = await prisma.categoria.findMany({
      where: busca ? { nome: { contains: busca, mode: 'insensitive' } } : undefined,
      orderBy: { nome: 'asc' },
    });

    res.json(categorias);
  } catch (error) {
    res.status(500).json({ codigo: 'ERRO_INTERNO', mensagem: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

categoriasRouter.post('/', async (req, res) => {
  try {
    const { nome } = req.body as { nome?: string };

    if (!nome || !nome.trim()) {
      res.status(400).json({ codigo: 'NOME_OBRIGATORIO', mensagem: 'O nome da categoria é obrigatório.' });
      return;
    }

    const categoria = await prisma.categoria.create({ data: { nome: nome.trim() } });
    res.status(201).json(categoria);
  } catch (error) {
    if (isViolacaoDeUnicidade(error)) {
      res.status(400).json({ codigo: 'NOME_DUPLICADO', mensagem: 'Já existe uma categoria com esse nome.' });
      return;
    }
    res.status(500).json({ codigo: 'ERRO_INTERNO', mensagem: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

categoriasRouter.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nome } = req.body as { nome?: string };

    if (!nome || !nome.trim()) {
      res.status(400).json({ codigo: 'NOME_OBRIGATORIO', mensagem: 'O nome da categoria é obrigatório.' });
      return;
    }

    const categoria = await prisma.categoria.update({
      where: { id },
      data: { nome: nome.trim() },
    });
    res.json(categoria);
  } catch (error) {
    if (isViolacaoDeUnicidade(error)) {
      res.status(400).json({ codigo: 'NOME_DUPLICADO', mensagem: 'Já existe uma categoria com esse nome.' });
      return;
    }
    if (isRegistroNaoEncontrado(error)) {
      res.status(404).json({ codigo: 'CATEGORIA_NAO_ENCONTRADA', mensagem: 'Categoria não encontrada.' });
      return;
    }
    res.status(500).json({ codigo: 'ERRO_INTERNO', mensagem: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

categoriasRouter.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.categoria.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    if (isRegistroNaoEncontrado(error)) {
      res.status(404).json({ codigo: 'CATEGORIA_NAO_ENCONTRADA', mensagem: 'Categoria não encontrada.' });
      return;
    }
    res.status(500).json({ codigo: 'ERRO_INTERNO', mensagem: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

function isViolacaoDeUnicidade(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002';
}

function isRegistroNaoEncontrado(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2025';
}
