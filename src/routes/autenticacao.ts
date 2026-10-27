import { Router } from 'express';
import { prisma } from '../prismaClient';
import { gerarHashSenha, senhaAtendeRegra, senhaEstaComHash, verificarSenha } from '../utils/senha';

export const autenticacaoRouter = Router();

const MENSAGEM_REGRA_SENHA = 'A senha deve ter pelo menos 8 caracteres, com letras e números';

autenticacaoRouter.post('/login', async (req, res) => {
  try {
    const { cpf, senha } = req.body as { cpf?: string; senha?: string };

    if (!cpf || typeof cpf !== 'string' || !cpf.trim()) {
      return res.status(400).json({ error: 'CPF é obrigatório' });
    }

    if (!senha || typeof senha !== 'string' || !senha.trim()) {
      return res.status(400).json({ error: 'Senha é obrigatória' });
    }

    const participante = await prisma.participante.findUnique({
      where: { cpf: cpf.replace(/\D/g, '') },
      include: { usuario: true },
    });

    if (!participante || !(await verificarSenha(senha, participante.senha))) {
      return res.status(401).json({ error: 'CPF ou senha inválidos' });
    }

    // Senha antiga ainda em texto puro: aproveita o login válido para gravar o hash.
    if (!senhaEstaComHash(participante.senha)) {
      await prisma.participante.update({
        where: { id: participante.id },
        data: { senha: await gerarHashSenha(senha) },
      });
    }

    res.json({
      usuarioId: participante.usuario.id,
      participanteId: participante.id,
      nome: participante.usuario.nome,
      cpf: participante.cpf,
      email: participante.usuario.email,
      tipo: participante.usuario.tipo,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

autenticacaoRouter.patch('/senha', async (req, res) => {
  try {
    const { cpf, novaSenha } = req.body as { cpf?: string; novaSenha?: string };

    if (!cpf || typeof cpf !== 'string' || !cpf.trim()) {
      return res.status(400).json({ error: 'CPF é obrigatório' });
    }

    if (!novaSenha || typeof novaSenha !== 'string' || !novaSenha.trim()) {
      return res.status(400).json({ error: 'Nova senha é obrigatória' });
    }

    if (!senhaAtendeRegra(novaSenha)) {
      return res.status(400).json({ error: MENSAGEM_REGRA_SENHA });
    }

    const cpfNormalizado = cpf.replace(/\D/g, '');

    const participante = await prisma.participante.findUnique({
      where: { cpf: cpfNormalizado },
    });

    if (!participante) {
      return res.status(404).json({ error: 'CPF não encontrado' });
    }

    await prisma.participante.update({
      where: { cpf: cpfNormalizado },
      data: { senha: await gerarHashSenha(novaSenha) },
    });

    res.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

function buscarUsuarioPesquisadorPorEmail(email: string) {
  return prisma.usuario.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } },
    include: { pesquisador: true },
  });
}

autenticacaoRouter.post('/pesquisadores/login', async (req, res) => {
  try {
    const { email, senha } = req.body as { email?: string; senha?: string };

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    if (!senha || typeof senha !== 'string' || !senha.trim()) {
      return res.status(400).json({ error: 'Senha é obrigatória' });
    }

    const usuario = await buscarUsuarioPesquisadorPorEmail(email);
    const pesquisador = usuario?.pesquisador;

    if (!usuario || !pesquisador?.senha || !(await verificarSenha(senha, pesquisador.senha))) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    res.json({
      usuarioId: usuario.id,
      pesquisadorId: pesquisador.id,
      nome: usuario.nome,
      email: usuario.email,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

autenticacaoRouter.patch('/pesquisadores/senha', async (req, res) => {
  try {
    const { email, novaSenha } = req.body as { email?: string; novaSenha?: string };

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    if (!novaSenha || typeof novaSenha !== 'string' || !novaSenha.trim()) {
      return res.status(400).json({ error: 'Nova senha é obrigatória' });
    }

    if (!senhaAtendeRegra(novaSenha)) {
      return res.status(400).json({ error: MENSAGEM_REGRA_SENHA });
    }

    const usuario = await buscarUsuarioPesquisadorPorEmail(email);

    if (!usuario?.pesquisador) {
      return res.status(404).json({ error: 'Email não encontrado' });
    }

    await prisma.pesquisador.update({
      where: { id: usuario.pesquisador.id },
      data: { senha: await gerarHashSenha(novaSenha) },
    });

    res.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
