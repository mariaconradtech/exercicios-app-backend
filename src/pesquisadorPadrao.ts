import { prisma } from './prismaClient';

// Ainda não existe login de pesquisador no backend, então as rotas de gestão de
// biblioteca (exercícios/categorias) usam sempre o primeiro pesquisador cadastrado.
let pesquisadorPadraoId: number | null = null;

export async function obterPesquisadorPadraoId(): Promise<number> {
  if (pesquisadorPadraoId !== null) {
    return pesquisadorPadraoId;
  }

  const pesquisador = await prisma.pesquisador.findFirst({ orderBy: { id: 'asc' } });
  if (!pesquisador) {
    throw new Error('Nenhum pesquisador cadastrado no banco.');
  }

  pesquisadorPadraoId = pesquisador.id;
  return pesquisadorPadraoId;
}
