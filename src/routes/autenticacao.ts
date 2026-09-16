import { Router } from 'express';
import { prisma } from '../prismaClient';

export const autenticacaoRouter = Router();

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

    if (!participante) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    // TODO: Implementar verificação de senha com bcrypt
    // const senhaValida = await bcrypt.compare(senha, usuario.participante.senha);
    // if (!senhaValida) {
    //   return res.status(401).json({ error: 'Email ou senha inválidos' });
    // }

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

function senhaAtendeRegra(senha: string): boolean {
  return senha.length >= 8 && /[a-zA-Z]/.test(senha) && /[0-9]/.test(senha);
}

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
      return res
        .status(400)
        .json({ error: 'A senha deve ter pelo menos 8 caracteres, com letras e números' });
    }

    const cpfNormalizado = cpf.replace(/\D/g, '');

    const participante = await prisma.participante.findUnique({
      where: { cpf: cpfNormalizado },
    });

    if (!participante) {
      return res.status(404).json({ error: 'CPF não encontrado' });
    }

    // TODO: Hash da nova senha com bcrypt
    await prisma.participante.update({
      where: { cpf: cpfNormalizado },
      data: { senha: novaSenha },
    });

    res.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

