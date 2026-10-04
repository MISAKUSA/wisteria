# Wisteria Discord Bot

A small, modular Discord bot with persistent sticky messages and staff-only user notes.

## Requirements

- Node.js 20 or newer
- A Discord application and bot token
- A Railway service with a persistent volume for bot data

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill in the Discord values.
3. Start the bot with `npm start`.

The bot registers its slash commands when it starts. Set `DISCORD_GUILD_ID` while developing to register them immediately in one server. Leave it unset to register global commands, which can take time to appear.

## Commands

- `/sticky set message [channel]` saves and posts a sticky message. When a member sends a message in that channel, the bot moves its sticky to the bottom.
- `/sticky view [channel]` shows the configured sticky to you.
- `/sticky remove [channel]` removes the sticky.
- `/autoreact set emoji [channel]` replaces the channel's automatic reactions with one emoji.
- `/autoreact add emoji [channel]` adds an emoji; each channel supports up to five.
- `/autoreact remove emoji [channel]` removes one emoji.
- `/autoreact view [channel]` shows the configured emojis.
- `/autoreact clear [channel]` turns automatic reactions off.
- `/customcommand create name text` creates or updates a custom slash command, such as `/rules`.
- `/customcommand list` shows this server’s custom commands.
- `/customcommand delete name` deletes a custom command.
- `/usernote add user note` adds a private staff note about a member.
- `/usernote list user` displays that member's notes privately.
- `/usernote remove note_id` deletes a note.

All bot commands require the **Manage Server** permission. Custom commands are specific to each server; their replies are visible to everyone and do not trigger mentions. User-note replies are ephemeral, and notes are scoped to their server. The bot needs **Add Reactions** permission in channels where automatic reactions are configured.

## Add a command

Create a `.js` file under `src/commands` that exports a `data` slash-command builder and an `execute(interaction, database)` function. The bot loads every command file in that directory and syncs the registered commands at startup. Persistent data helpers are in `src/database.js`.

## Deploy on Railway

Create a Railway service from this repository and set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in its variables. Optionally set `DISCORD_GUILD_ID` for a single server. Attach a Railway volume mounted at `/data`, then set `DATABASE_PATH` to `/data/bot.json`. Without a volume, Railway may discard saved data when the service is redeployed.

Invite the bot with the `bot` and `applications.commands` scopes and the **View Channels** and **Send Messages** permissions. The bot does not need the privileged Message Content intent.