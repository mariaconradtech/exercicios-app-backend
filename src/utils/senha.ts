import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt) as (senha: string, salt: string, tamanho: number) => Promise<Buffer>;

const TAMANHO_CHAVE = 64;
const FORMATO_HASH = /^[0-9a-f]{32}:[0-9a-f]{128}$/;

export function senhaAtendeRegra(senha: string): boolean {
  return senha.length >= 8 && /[a-zA-Z]/.test(senha) && /[0-9]/.test(senha);
}

// Formato armazenado: "<salt>:<hash>", ambos em hexadecimal.
export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(senha, salt, TAMANHO_CHAVE);
  return `${salt}:${hash.toString('hex')}`;
}

// Senhas gravadas antes do hash existir ainda estão em texto puro no banco.
export function senhaEstaComHash(senhaArmazenada: string): boolean {
  return FORMATO_HASH.test(senhaArmazenada);
}

export async function verificarSenha(senha: string, senhaArmazenada: string): Promise<boolean> {
  if (!senhaEstaComHash(senhaArmazenada)) {
    const recebida = Buffer.from(senha);
    const esperada = Buffer.from(senhaArmazenada);
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
  }

  const [salt, hashHex] = senhaArmazenada.split(':');
  const hashEsperado = Buffer.from(hashHex, 'hex');
  const hash = await scryptAsync(senha, salt, hashEsperado.length);
  return timingSafeEqual(hash, hashEsperado);
}
