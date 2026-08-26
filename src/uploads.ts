import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import multer from 'multer';

export const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads', 'videos');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const TIPOS_VIDEO_ACEITOS = ['video/mp4', 'video/webm', 'video/quicktime'];

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOADS_DIR),
  filename: (_req, file, callback) => {
    const extensao = path.extname(file.originalname) || '.mp4';
    callback(null, `${crypto.randomUUID()}${extensao}`);
  },
});

export const uploadVideo = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!TIPOS_VIDEO_ACEITOS.includes(file.mimetype)) {
      callback(new Error('Formato de vídeo não suportado. Envie MP4, WebM ou MOV.'));
      return;
    }
    callback(null, true);
  },
});

// Usa PUBLIC_BASE_URL quando definido, pra gerar sempre o mesmo endereço (ex.: o IP da
// rede local) independente de quem fez a requisição — assim o vídeo funciona tanto pro
// pesquisador quanto pro app mobile em outro aparelho. Sem essa variável, cai no host da
// própria requisição (só funciona pra quem acessa pelo mesmo endereço que criou o registro).
export function montarUrlVideo(req: Request, nomeArquivo: string): string {
  const base = process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/uploads/videos/${nomeArquivo}`;
}

// Best-effort: se a URL não apontar pra um arquivo nosso (ex.: link antigo do YouTube), apenas ignora.
export function removerArquivoVideo(videoUrl: string): void {
  try {
    const nomeArquivo = path.basename(new URL(videoUrl).pathname);
    const caminho = path.join(UPLOADS_DIR, nomeArquivo);
    if (fs.existsSync(caminho)) {
      fs.unlinkSync(caminho);
    }
  } catch {
    // URL inválida ou externa: nada a remover localmente.
  }
}
