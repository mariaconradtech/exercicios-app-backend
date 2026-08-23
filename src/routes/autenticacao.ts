import { Router } from 'express';
import { prisma } from '../prismaClient';

export const autenticacaoRouter = Router();

autenticacaoRouter.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body as { email?: string; senha?: string };

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    if (!senha || typeof senha !== 'string' || !senha.trim()) {
      return res.status(400).json({ error: 'Senha é obrigatória' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: email.trim() },
      include: { participante: true },
    });

    if (!usuario || !usuario.participante) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    // TODO: Implementar verificação de senha com bcrypt
    // const senhaValida = await bcrypt.compare(senha, usuario.participante.senha);
    // if (!senhaValida) {
    //   return res.status(401).json({ error: 'Email ou senha inválidos' });
    // }

    res.json({
      usuarioId: usuario.id,
      participanteId: usuario.participante.id,
      nome: usuario.nome,
      email: usuario.email,
      tipo: usuario.tipo,
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

autenticacaoRouter.get('/engajamento', async (req, res) => {
  try {
    const participanteId = Number(req.query.participanteId);

    if (!Number.isFinite(participanteId) || participanteId <= 0) {
      return res.status(400).json({ error: 'participanteId inválido' });
    }

    const perfil = await prisma.perfilGamificado.findUnique({
      where: { participanteId },
    });

    if (!perfil) {
      return res.status(404).json({ error: 'Perfil de gamificação não encontrado' });
    }

    res.json({
      participanteId: perfil.participanteId,
      nivelAtual: perfil.nivelAtual,
      pontos: perfil.pontos,
      estrelas: perfil.estrelas,
      medalhas: perfil.medalhas,
      trofeus: perfil.trofeus,
      faseAtual: perfil.faseAtual,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});
