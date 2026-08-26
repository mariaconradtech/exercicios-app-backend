import { prisma } from './prismaClient';
import { Prisma, TipoUsuario } from '../generated/prisma/client';

// Ainda não existe login de pesquisador no backend, então as rotas de gestão de
// biblioteca (exercícios/categorias) usam sempre o primeiro pesquisador cadastrado.
// Se nenhum existir ainda (banco novo, sem seed), um pesquisador padrão é criado
// automaticamente na primeira chamada, em vez de bloquear a criação de exercícios.
let pesquisadorPadraoId: number | null = null;

const PESQUISADOR_PADRAO_EMAIL = 'pesquisador.padrao@sistema.local';
const PESQUISADOR_PADRAO_NOME = 'Pesquisador Padrão';
const PESQUISADOR_PADRAO_UNIVERSIDADE = 'Não informado';

async function criarPesquisadorPadrao(): Promise<number> {
  try {
    const usuario = await prisma.usuario.create({
      data: {
        nome: PESQUISADOR_PADRAO_NOME,
        email: PESQUISADOR_PADRAO_EMAIL,
        tipo: TipoUsuario.PESQUISADOR,
        pesquisador: { create: { universidade: PESQUISADOR_PADRAO_UNIVERSIDADE } },
      },
      include: { pesquisador: true },
    });

    return usuario.pesquisador!.id;
  } catch (error) {
    // Corrida entre requisições simultâneas: outra chamada já criou o usuário padrão
    // entre o findFirst e este create. Reaproveita o pesquisador criado por ela.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const usuarioExistente = await prisma.usuario.findUnique({
        where: { email: PESQUISADOR_PADRAO_EMAIL },
        include: { pesquisador: true },
      });

      if (usuarioExistente?.pesquisador) {
        return usuarioExistente.pesquisador.id;
      }
    }

    throw error;
  }
}

export async function obterPesquisadorPadraoId(): Promise<number> {
  if (pesquisadorPadraoId !== null) {
    return pesquisadorPadraoId;
  }

  const pesquisadorExistente = await prisma.pesquisador.findFirst({ orderBy: { id: 'asc' } });
  if (pesquisadorExistente) {
    pesquisadorPadraoId = pesquisadorExistente.id;
    return pesquisadorPadraoId;
  }

  pesquisadorPadraoId = await criarPesquisadorPadrao();
  return pesquisadorPadraoId;
}
