import 'dotenv/config';
import { PrismaClient, TipoUsuario, GeneroAvatar, FaseTreino, StatusSessao } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { calcularDuracaoEstimadaMinutos } from '../src/utils/treino';

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
      videoUrl: 'https://youtube.com/shorts/UHa9U-O09_U?si=IXJtnNnXIwWJBp3Y',
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
      videoUrl: 'https://youtube.com/shorts/nvVa-WFGwmM?si=wd0kKRonfacnLWnF',
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
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      instrucao: [
        'Incline o tronco à frente mantendo a coluna reta.',
        'Puxe a barra em direção ao abdômen.',
        'Controle a descida da barra até a extensão total dos braços.',
      ],
      ativo: true,
    },
  });

  const exercicio4 = await prisma.exercicio.create({
    data: {
      pesquisadorId,
      categoriaId: categoriaForca.id,
      nome: 'Desenvolvimento com Halteres',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      instrucao: [
        'Sente-se com apoio nas costas, halteres na altura dos ombros.',
        'Empurre os halteres para cima até quase estender os cotovelos.',
        'Desça controladamente até a posição inicial.',
      ],
      ativo: true,
    },
  });

  const exercicio5 = await prisma.exercicio.create({
    data: {
      pesquisadorId,
      categoriaId: categoriaForca.id,
      nome: 'Rosca Direta',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
      instrucao: [
        'Segure a barra com os braços estendidos ao lado do corpo.',
        'Flexione os cotovelos trazendo a barra até os ombros.',
        'Desça controladamente sem balançar o tronco.',
      ],
      ativo: true,
    },
  });

  const exercicio6 = await prisma.exercicio.create({
    data: {
      pesquisadorId,
      categoriaId: categoriaForca.id,
      nome: 'Tríceps na Polia',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
      instrucao: [
        'Segure a barra da polia com os cotovelos junto ao corpo.',
        'Estenda os braços empurrando a barra para baixo.',
        'Retorne controladamente sem afastar os cotovelos do corpo.',
      ],
      ativo: true,
    },
  });

  // 4. Treino (tela de execução/descanso)
  const descansoEntreSeriesSegundos = 60;
  const itensTreino = [
    { exercicioId: exercicio1.id, series: 3, descansoSegundos: 60, multiplicadorVelocidade: 1.0 },
    { exercicioId: exercicio2.id, series: 3, descansoSegundos: 90, multiplicadorVelocidade: 1.0 },
    { exercicioId: exercicio3.id, series: 3, descansoSegundos: 60, multiplicadorVelocidade: 1.0 },
  ];

  const treino = await prisma.treino.create({
    data: {
      nome: 'Treino de Força - Semana 1',
      instrucoes: 'Treino introdutório de força para iniciantes. Use um tapete e halteres leves.',
      fase: FaseTreino.INICIANTE,
      nivel: 1,
      quantidadeSemanas: 4,
      descansoEntreSeriesSegundos,
      duracaoEstimadaMinutos: calcularDuracaoEstimadaMinutos(itensTreino, descansoEntreSeriesSegundos),
      exercicios: {
        create: itensTreino,
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