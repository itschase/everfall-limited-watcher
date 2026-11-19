export interface DiscordSlashCommandDoc {
  name: string;
  command: string;
  summary: string;
  detailedSummary: string;
  permission: string;
  visibility: string;
}

export const DISCORD_SLASH_COMMANDS: DiscordSlashCommandDoc[] = [
  {
    name: "setup",
    command: "/setup <#channel>",
    summary: "Set the destination channel for new limited vehicle alerts.",
    detailedSummary:
      "Selects the Discord text channel where verified limited vehicle announcements are posted and updated in place.",
    permission: "Manage Server / Admin",
    visibility: "Ephemeral setup reply",
  },
  {
    name: "widget",
    command: "/widget",
    summary:
      "Preview privately and deploy an auto-updating live stock & recent drops widget.",
    detailedSummary:
      "Generates an ephemeral preview of the Live Status Board so an administrator can confirm channel placement before publishing.",
    permission: "Manage Server / Admin",
    visibility: "Private preview first",
  },
  {
    name: "add-role",
    command: "/add-role <@role>",
    summary: "Add a Discord role to mention when a limited drop is published.",
    detailedSummary:
      "Adds a mentionable role to your server's new-drop notification ping list without triggering test or sold-out re-pings.",
    permission: "Manage Server / Admin",
    visibility: "Private confirmation",
  },
  {
    name: "remove-role",
    command: "/remove-role <@role>",
    summary: "Remove a role from server notification mentions.",
    detailedSummary:
      "Removes a configured role from future limited drop pings cleanly in seconds.",
    permission: "Manage Server / Admin",
    visibility: "Private confirmation",
  },
  {
    name: "check",
    command: "/check",
    summary: "Run an on-demand store scan for unsent active drops.",
    detailedSummary:
      "Triggers an authoritative check against stored/monitored availability and dispatches unsent active drops to the configured channel.",
    permission: "Manage Server / Admin",
    visibility: "Private status feedback",
  },
  {
    name: "help",
    command: "/help",
    summary: "Open server configuration summary and interactive controls.",
    detailedSummary:
      "Displays current alert channel, configured mention roles, quick-action buttons, and command guidance inside Discord.",
    permission: "Manage Server / Server Visibility",
    visibility: "Ephemeral control card",
  },
];
