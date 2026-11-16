// commands.ts – registers Discord slash commands and routes interaction callbacks

import { InteractionResponseType, InteractionType, APIInteraction } from "discord-interactions";

// Define a minimal InteractionResponse shape used in responses
interface InteractionResponse {
  type: number;
  data?: { content: string; flags?: number };
}
import { getGuildConfig, setGuildConfig, addGuildRole, removeGuildRole } from "./kv";

function respond(content:string, flags=0){
  const resp: InteractionResponse = {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags },
  } as any;
  return new Response(JSON.stringify(resp),{ headers:{"Content-Type":"application/json"} });
}

// Minimal APIInteraction type matching Discord payload
interface APIInteraction {
  type: number;
  data?: { name: string; options?: {name:string; value:string}[] };
  guild_id?: string;
}

export async function handleInteraction(req: Request): Promise<Response>{
  const body = await req.json();
  const { type, data, guild_id } = body as APIInteraction;
  if(type===InteractionType.Ping){
    return new Response(JSON.stringify({type: InteractionResponseType.PONG,}));
  }
  if(!guild_id) return respond("Use this command in a server.");
  switch(data?.name){
    case "setup":
      const channel = data?.options?.find(o=>o.name==="channel")?.value as string;
      if(!channel) return respond("Specify a channel.");
      await setGuildConfig(guild_id,{channelId:channel,roleIds:[]});
      return respond(`✅ Configured for <#${channel}>`);
    case "add-role":
      const addId=data?.options?.[0]?.value as string;
      await addGuildRole(guild_id,addId);
      return respond(`✅ Added role <@&${addId}>`);
    case "remove-role":
      const remId=data?.options?.[0]?.value as string;
      await removeGuildRole(guild_id,remId);
      return respond(`✅ Removed role <@&${remId}>`);
    case "check":
      // placeholder – real scraper will be invoked later
      return respond("🔎 Manual check triggered.",64);
    case "help":
      return respond(`**Everfall Limited Watcher**\n- /setup <#channel> – set alert channel\n- /add-role @role – add role to mention\n- /remove-role @role – remove role\n- /check – run immediate check\n- /help – show this help`);
    default:
      return respond("Unknown command.");
  }
}
