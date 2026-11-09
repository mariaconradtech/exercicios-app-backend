import { createHash, randomBytes } from 'crypto';

// Token de sessão opaco da área web. O valor puro vai só para o navegador;
// no banco (usuario.token) fica apenas o hash, para que um vazamento do banco
// não permita se passar pelo usuário.
export function gerarTokenSessao(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashTokenSessao(token) };
}

export function hashTokenSessao(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Extrai o token de um header `Authorization: Bearer <token>`. */
export function extrairTokenBearer(header: string | undefined): string | null {
  const correspondencia = header?.match(/^Bearer\s+([0-9a-f]{64})$/i);
  return correspondencia ? correspondencia[1].toLowerCase() : null;
}
