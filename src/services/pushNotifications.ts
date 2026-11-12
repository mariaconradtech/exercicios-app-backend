/**
 * Envio de Push Notifications "fora do app" via Expo Push Notifications.
 *
 * O aplicativo mobile (Expo/React Native) registra, no login, o token Expo do
 * dispositivo em `Participante.expoPushToken`. Este serviço chama a API
 * pública da Expo (https://exp.host/--/api/v2/push/send) para disparar as
 * notificações a partir do backend — funciona mesmo com o app fechado, pois
 * o envio é feito pelos servidores da Expo diretamente ao sistema
 * operacional do aparelho (APNs/FCM por baixo dos panos).
 *
 * Não é necessário nenhum SDK adicional: a API de envio é um HTTP POST simples.
 */

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const TAMANHO_MAXIMO_LOTE = 100;

export interface MensagemPush {
  /** Token Expo do dispositivo, no formato "ExponentPushToken[...]". */
  to: string;
  title: string;
  body: string;
  /** Dados extras entregues ao app quando a notificação é tocada. */
  data?: Record<string, unknown>;
}

/**
 * Valida o formato de um token Expo Push. Tokens inválidos ou nulos nunca
 * devem ser enviados à API da Expo (ela rejeita o lote inteiro em caso de
 * token malformado).
 */
export function tokenPushValido(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(token.trim());
}

function dividirEmLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let indice = 0; indice < itens.length; indice += tamanho) {
    lotes.push(itens.slice(indice, indice + tamanho));
  }
  return lotes;
}

/**
 * Envia um lote de notificações push. Nunca lança erro para o chamador: uma
 * falha no envio (ex.: Expo fora do ar, token expirado) não deve interromper
 * o agendador nem afetar o restante do fluxo do app — apenas registra no log.
 */
export async function enviarNotificacoesPush(mensagens: MensagemPush[]): Promise<void> {
  const mensagensValidas = mensagens.filter((mensagem) => tokenPushValido(mensagem.to));

  if (mensagensValidas.length === 0) {
    return;
  }

  const lotes = dividirEmLotes(mensagensValidas, TAMANHO_MAXIMO_LOTE);

  for (const lote of lotes) {
    try {
      const resposta = await fetch(EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          lote.map((mensagem) => ({
            to: mensagem.to,
            title: mensagem.title,
            body: mensagem.body,
            sound: 'default',
            data: mensagem.data ?? {},
          })),
        ),
      });

      if (!resposta.ok) {
        const textoErro = await resposta.text().catch(() => '');
        console.error(
          `[pushNotifications] Falha ao enviar lote de ${lote.length} notificação(ões) via Expo: ${resposta.status} ${textoErro}`,
        );
      }
    } catch (error) {
      console.error(
        '[pushNotifications] Erro de rede ao chamar a API de push da Expo:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}

/** Envia uma única notificação push. Conveniência sobre `enviarNotificacoesPush`. */
export async function enviarNotificacaoPush(mensagem: MensagemPush): Promise<void> {
  await enviarNotificacoesPush([mensagem]);
}
