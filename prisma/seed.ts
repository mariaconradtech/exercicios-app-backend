import 'dotenv/config';
import { PrismaClient, TipoUsuario, GeneroAvatar, FaseTreino, StatusSessao } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });


async function main() {
  console.log('Iniciando o seeding do banco de dados...');

  // 1. Usuário Pesquisador (necessário para cadastrar exercícios e treinos)
  const userPesquisador = await prisma.usuario.upsert({
    where: { email: 'pesquisador@ufpr.br' },
    update: {},
    create: {
      nome: 'Dr. Pesquisador',
      email: 'pesquisador@ufpr.br',
      tipo: TipoUsuario.PESQUISADOR,
      pesquisador: {
        create: {
          universidade: 'UFPR',
        },
      },
    },
    include: { pesquisador: true },
  });

  const pesquisadorId = userPesquisador.pesquisador!.id;

  // 2. Categoria dos exercícios
  const categoriaForca = await prisma.categoria.upsert({
    where: { nome: 'Força' },
    update: {},
    create: { nome: 'Força' },
  });

  // 3. Exercícios
  const exercicio1 = await prisma.exercicio.create({
    data: {
      pesquisadorId,
      categoriaId: categoriaForca.id,
      nome: 'Supino Reto com Barra',
      videoUrl: 'https://exemplo.com/videos/supino.mp4',
      instrucao: [
        'Deite-se no banco alinhado com a barra.',
        'Segure a barra com pegada na largura dos ombros.',
        'Desça controladamente até o peito e empurre para cima.',
      ],
      ativo: true,
    },
  });

  const exercicio2 = await prisma.exercicio.create({
    data: {
      pesquisadorId,
      categoriaId: categoriaForca.id,
      nome: 'Agachamento Livre',
      videoUrl: 'https://exemplo.com/videos/agachamento.mp4',
      instrucao: [
        'Posicione a barra nos trapézios.',
        'Mantenha os pés na largura dos ombros.',
        'Desça flexionando os joelhos mantendo a coluna reta.',
      ],
      ativo: true,
    },
  });

  const exercicio3 = await prisma.exercicio.create({
    data: {
      pesquisadorId,
      categoriaId: categoriaForca.id,
      nome: 'Remada Curvada',
      videoUrl: 'https://exemplo.com/videos/remada.mp4',
      instrucao: [
        'Incline o tronco à frente mantendo a coluna reta.',
        'Puxe a barra em direção ao abdômen.',
        'Controle a descida da barra até a extensão total dos braços.',
      ],
      ativo: true,
    },
  });

  // 4. Treino (tela de execução/descanso)
  const treino = await prisma.treino.create({
    data: {
      pesquisadorId,
      nome: 'Treino de Força - Semana 1',
      descricao: 'Treino introdutório de força para iniciantes',
      fase: FaseTreino.INICIANTE,
      nivel: 1,
      quantidadeSemanas: 4,
      ativo: true,
      exercicios: {
        create: [
          {
            exercicioId: exercicio1.id,
            ordem: 1,
            series: 3,
            descansoSegundos: 60,
            multiplicadorVelocidade: 1.0,
            duracaoEstimadaSegundos: 45,
          },
          {
            exercicioId: exercicio2.id,
            ordem: 2,
            series: 3,
            descansoSegundos: 90,
            multiplicadorVelocidade: 1.0,
            duracaoEstimadaSegundos: 60,
          },
          {
            exercicioId: exercicio3.id,
            ordem: 3,
            series: 3,
            descansoSegundos: 60,
            multiplicadorVelocidade: 1.0,
            duracaoEstimadaSegundos: 50,
          },
        ],
      },
    },
  });

  // 5. Usuário Participante (testar tela de instrução/feedback)
  const userParticipante = await prisma.usuario.upsert({
    where: { email: 'manu.participante@email.com' },
    update: {},
    create: {
      nome: 'Manu Participante',
      email: 'manu.participante@email.com',
      tipo: TipoUsuario.PARTICIPANTE,
      participante: {
        create: {
          cpf: '12345678900',
          senha: 'senha_segura_123',
          perfil: {
            create: {
              avatarGenero: GeneroAvatar.FEMININO,
              avatarPersonagem: 'guerreira_01',
              nomeAvatar: 'Valente',
              faseAtual: FaseTreino.INICIANTE,
              nivelAtual: 1,
              pontos: 100,
            },
          },
        },
      },
    },
    include: { participante: true },
  });

  const participanteId = userParticipante.participante!.id;

  // 6. Sessão de treino já existente, EM_ANDAMENTO (testar o fluxo de execução)
  const sessaoEmAndamento = await prisma.sessaoTreino.create({
    data: {
      participanteId,
      treinoId: treino.id,
      status: StatusSessao.EM_ANDAMENTO,
      percentualConcluido: 33.3,
    },
  });

  // 7. Sessão de treino CONCLUIDA com feedback (esforcoOmni de 1 a 10)
  const sessaoComFeedback = await prisma.sessaoTreino.create({
    data: {
      participanteId,
      treinoId: treino.id,
      status: StatusSessao.CONCLUIDA,
      dataFim: new Date(),
      tempoRealizadoSegundos: 1800,
      percentualConcluido: 100,
      esforcoOmni: 7,
      pontosGanhos: 50,
    },
  });

  console.log({
    userPesquisador,
    categoriaForca,
    exercicio1,
    exercicio2,
    exercicio3,
    treino,
    userParticipante,
    sessaoEmAndamento,
    sessaoComFeedback,
  });
  console.log('Seeding concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro durante o seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });