export const COMMANDS = [
  {
    name: "setup",
    description: "Configure the channel for Everfall limited drop alerts",
    options: [
      {
        name: "channel",
        description: "Channel to post alerts in",
        type: 7, // CHANNEL
        required: true,
      },
    ],
  },
  {
    name: "add-role",
    description: "Add a role to ping when a limited drop occurs",
    options: [
      {
        name: "role",
        description: "Role to mention",
        type: 8, // ROLE
        required: true,
      },
    ],
  },
  {
    name: "remove-role",
    description: "Remove a role from drop notifications",
    options: [
      {
        name: "role",
        description: "Role to remove",
        type: 8, // ROLE
        required: true,
      },
    ],
  },
  {
    name: "check",
    description: "Manually check the Everfall store for limited car stock",
  },
  {
    name: "help",
    description: "View Everfall Limited Watcher setup and commands",
  },
];

export async function registerCommands(env: any): Promise<Response> {
  const token = env.DISCORD_BOT_TOKEN;
  const appId = env.DISCORD_APPLICATION_ID || "1571958001928245378";

  if (!token) {
    return new Response(
      JSON.stringify({ error: "DISCORD_BOT_TOKEN secret is not set in Worker environment." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COMMANDS),
  });

  const data = await res.json();
  return new Response(JSON.stringify({ status: res.status, result: data }, null, 2), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
