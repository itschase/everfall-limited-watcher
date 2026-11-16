declare module 'discord-interactions' {
  export const InteractionResponseType: {
    CHANNEL_MESSAGE_WITH_SOURCE: number;
    PONG: number;
  };
  export const InteractionType: {
    PING: number;
  };
  export type APIInteraction = {
    type: number;
    data?: { name: string; options?: { name: string; value: string }[] };
    guild_id?: string;
  };
}
