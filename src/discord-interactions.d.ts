declare module 'discord-interactions' {
  export const InteractionResponseType: {
    PONG: number;
    CHANNEL_MESSAGE_WITH_SOURCE: number;
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: number;
    DEFERRED_UPDATE_MESSAGE: number;
    UPDATE_MESSAGE: number;
  };
  export const InteractionType: {
    PING: number;
    APPLICATION_COMMAND: number;
    MESSAGE_COMPONENT: number;
  };
  export function verifyKey(
    rawBody: string | Uint8Array | ArrayBuffer,
    signature: string,
    timestamp: string,
    clientPublicKey: string
  ): Promise<boolean>;
}
