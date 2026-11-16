declare module 'discord-interactions' {
  export const InteractionResponseType: {
    CHANNEL_MESSAGE_WITH_SOURCE: number;
    PONG: number;
  };
  export const InteractionType: {
    PING: number;
    APPLICATION_COMMAND: number;
  };
  export function verifyKey(
    rawBody: string | Uint8Array | ArrayBuffer,
    signature: string,
    timestamp: string,
    clientPublicKey: string
  ): Promise<boolean>;
}
