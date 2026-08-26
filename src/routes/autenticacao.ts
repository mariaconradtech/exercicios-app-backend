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

autenticacaoRouter.patch('/senha', async (req, res) => {
  try {
    const { email, senhaAtual, senhaNova } = req.body as {
      email?: string;
      senhaAtual?: string;
      senhaNova?: string;
    };

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    if (!senhaAtual || typeof senhaAtual !== 'string' || !senhaAtual.trim()) {
      return res.status(400).json({ error: 'Senha atual é obrigatória' });
    }

    if (!senhaNova || typeof senhaNova !== 'string' || !senhaNova.trim()) {
      return res.status(400).json({ error: 'Nova senha é obrigatória' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: email.trim() },
      include: { participante: true },
    });

    if (!usuario || !usuario.participante) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    // TODO: Implementar verificação de senha com bcrypt
    // const senhaValida = await bcrypt.compare(senhaAtual, usuario.participante.senha);
    // if (!senhaValida) {
    //   return res.status(401).json({ error: 'Senha atual inválida' });
    // }

    // TODO: Hash da nova senha com bcrypt
    // const senhaCriptografada = await bcrypt.hash(senhaNova, 10);

    // await prisma.participante.update({
    //   where: { usuarioId: usuario.id },
    //   data: { senha: senhaCriptografada },
    // });

    res.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

