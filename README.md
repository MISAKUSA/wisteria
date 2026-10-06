# Wisteria Discord Bot

A small, modular Discord bot with persistent sticky messages and staff-only user notes.

## Requirements

- Node.js 20 or newer
- A Discord application and bot token
- The **Message Content Intent** enabled for the bot in the Discord Developer Portal
- The **Server Members Intent** enabled for moderation, quarantine, and anti-raid join detection
- A Railway service with a persistent volume for bot data

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill in the Discord values.
3. Start the bot with `npm start`.

The bot registers its slash commands when it starts. Set `DISCORD_GUILD_ID` while developing to register them immediately in one server. Leave it unset to register global commands, which can take time to appear.

## Commands

- `/forumtopic forum title message [image]` creates a new post in the selected forum channel, optionally including an image attachment.
- `/randomsend message image` sends your message and image to a randomly selected text channel where the bot can post attachments.
- `/rolebutton role [label] [message]` posts a button members can use to add or remove the selected role, and privately returns a link to that message.
- `/autodelete set duration unit [channel]` automatically deletes new messages after a chosen number of seconds, minutes, or hours (up to 7 days).
- `/autodelete view [channel]` shows the automatic deletion delay.
- `/autodelete clear [channel]` turns automatic deletion off.
- `/autothread set [channel]` starts a thread when a member posts an image in the channel.
- `/autothread view [channel]` shows whether automatic image threads are enabled.
- `/autothread clear [channel]` turns automatic image threads off.
- `/autorole set role` replaces the automatic roles with one role; `/autorole add role` adds another, `/autorole remove role` removes one, `/autorole view` lists them, and `/autorole clear` disables all automatic roles.
- `/sticky set message [channel]` saves and posts a sticky message. When a member sends a message in that channel, the bot moves its sticky to the bottom.
- `/sticky view [channel]` shows the configured sticky to you.
- `/sticky remove [channel]` removes the sticky.
- `/starboard set channel [threshold]` sends messages with enough ⭐ reactions to the configured channel; the default threshold is 3. `/starboard view` displays the settings and `/starboard clear` disables the starboard.
- `/autoreact set emoji [channel]` replaces the channel's automatic reactions with one emoji.
- `/autoreact add emoji [channel]` adds an emoji; each channel supports up to five.
- `/autoreact remove emoji [channel]` removes one emoji.
- `/autoreact view [channel]` shows the configured emojis.
- `/autoreact clear [channel]` turns automatic reactions off.
- `/customcommand create name text` creates or updates a custom slash command, such as `/rules`.
- `/customcommand list` shows this server’s custom commands.
- `/customcommand delete name` deletes a custom command.
- `/confession set channel` posts an anonymous-submission panel and sets the confession channel; `/confession view` shows it and `/confession clear` disables new submissions. Members use the panel buttons to submit confessions, create native polls, or anonymously reply in each confession’s thread.
- `/logging set channel` sends bot activity logs to a text channel; `/logging enable` and `/logging disable` control logging, `/logging view` shows its status, and `/logging clear` removes the configured channel.
- `/logging types` shows which event categories are logged. `/logging event type enabled` turns an individual category on or off, including confessions, photos, videos, voice messages, member changes, voice activity, and bot interactions.
- `/leveling settings enable`, `/leveling settings disable`, and `/leveling settings view` control and display this server’s XP system. `/leveling settings configure minimum_xp maximum_xp cooldown_seconds` adjusts message XP.
- `/leveling announcement set channel` and `/leveling announcement clear` configure level-up announcements.
- `/leveling reward set level role`, `/leveling reward remove level`, and `/leveling reward list` configure level role rewards. The highest eligible reward replaces lower reward roles.
- `/rank [user]` shows a member’s XP and level; `/leaderboard` shows the server’s top 10.
- `/warn user reason`, `/warnings user`, and `/clearwarn user [case_id]` manage formal warning cases.
- `/timeout user duration reason` applies a timeout for a duration such as `5m`, `1h`, or `1d` (up to 28 days).
- `/mute user duration reason`, `/unmute user`, `/vmute user`, `/vdeafen user`, `/vdisconnect user`, and `/vmove user channel` manage voice moderation.
- `/kick user reason`, `/ban user reason [delete_days]`, `/softban user reason`, and `/unban user_id` manage server bans and kicks.
- `/purge amount [user]` and `/clear amount [safe]` remove up to 100 recent messages. Safe clear skips pinned messages.
- `/slowmode seconds`, `/lock [channel] [reason]`, `/unlock [channel]`, and `/lockdown [duration]` control channel access.
- `/case case_id` displays a moderation case. `/note user text` adds a private staff note.
- `/nuke confirm` clones and deletes the current text channel. It requires an explicit confirmation option.
- `/clone [channel]` duplicates a channel without deleting the original.
- `/antiraid enable [threshold] [window] [alert_channel]` alerts moderators about join spikes; it does not automatically kick or ban anyone. `/antiraid disable` turns it off.
- `/massban user_ids reason` bans up to 100 comma- or space-separated user IDs.
- `/quarantine user role reason` removes the member's manageable roles and assigns the quarantine role. `/unquarantine user` restores their saved roles.
- `/honeypot set channel action` configures a channel to kick or ban members who post there. `/honeypot clear channel` disables it.
- `/role add user role` and `/role remove user role` assign or remove an existing role, including your configured moderator or admin roles. `/role human add role` and `/role human remove role` apply a role to all human members.
- `/channelperm access channel role mode` allows, denies, or resets a role's channel visibility for a channel or category. Use this to give a verified-member role access to a channel or category.
- `/channelperm nsfw channel enabled` turns a text, announcement, forum, or media channel's NSFW setting on or off. NSFW is a channel setting, not a category setting.
- `/nick user [nickname]` changes or resets a member's nickname.
- `/prefix view` shows the server's text-command prefix; `/prefix set value` changes it. The default is `!` and prefixes may contain 1-5 non-space characters.

The moderation slash commands and prefix commands require the corresponding moderation permission (for example, **Ban Members**, **Kick Members**, **Moderate Members**, or **Manage Messages**). Prefix commands send their replies privately to the moderator; change the per-server prefix with `/prefix set`. High-impact actions such as `/nuke`, `/massban`, `/role human`, `/lockdown`, and ban-mode honeypots should be restricted to trusted moderators. `/nuke` permanently deletes the original channel and its history. Honeypot enforcement kicks or bans any member who posts in the configured channel; test its permissions and access restrictions before enabling it.

Other bot permissions depend on enabled features: **View Channels**, **Send Messages**, **Embed Links**, **Manage Messages**, **Manage Channels**, **Manage Roles**, **Manage Guild**, **Kick Members**, **Ban Members**, **Moderate Members**, **Mute Members**, **Deafen Members**, **Move Members**, **Manage Nicknames**, **Attach Files**, **Add Reactions**, and **Create Public Threads**. Role actions require the bot's highest role to be above the target role; member moderation also follows Discord's role hierarchy. The `/autorole` command requires **Manage Server** and **Manage Roles**, and the bot's highest role must be above each selected role. The `/channelperm` command requires **Manage Channels**; its access subcommand also requires **Manage Roles** for both the moderator and bot. Custom commands are specific to each server; their replies are visible to everyone and do not trigger mentions. Moderator-note replies are private, and notes are scoped to their server.

The `/logging` command requires **Manage Server**. Logging is enabled for all event categories by default. Use `/logging types` to inspect them and `/logging event` to toggle a category without affecting others. Photos, videos, and voice messages have separate switches. When enabled, the bot can log message edits/deletions, shared media, slash and prefix command use, member joins/leaves and profile/role/timeout changes, channel and thread changes, bans/unbans, and voice activity. Confession logs include submitter identity and content. The bot needs permission to view and send messages in the configured log channel.

Confessions are anonymous in the public channel and replies thread: only the bot posts their content. When event logging is enabled, the configured log channel records the submitter’s identity and confession or reply content for moderators. Configure a private log channel if this information should only be visible to staff. The confession channel requires **View Channel**, **Send Messages**, **Embed Links**, **Create Public Threads**, **Send Messages in Threads**, and **Send Polls**.

Leveling is configured per server and starts disabled. Members earn a random configured amount of XP from messages, subject to a per-member cooldown. Each level requires 100 more XP than the previous one. Role rewards require the bot’s **Manage Roles** permission and its highest role to be above each reward role. The bot needs **View Channel** and **Send Messages** in a configured announcement channel. Starboard also requires the **Guild Message Reactions** intent. The bot needs **View Channel**, **Send Messages**, **Embed Links**, and **Read Message History** in its configured starboard channel.

## Add a command

Create a `.js` file under `src/commands` that exports a `data` slash-command builder and an `execute(interaction, database)` function. The bot loads every command file in that directory and syncs the registered commands at startup. Persistent data helpers are in `src/database.js`.

## Deploy on Railway

Create a Railway service from this repository and set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in its variables. Optionally set `DISCORD_GUILD_ID` for a single server. Attach a Railway volume mounted at `/data`, then set `DATABASE_PATH` to `/data/bot.json`. Without a volume, Railway may discard saved data when the service is redeployed.

Invite the bot with the `bot` and `applications.commands` scopes and the permissions required for the features you enable. Enable the privileged **Message Content Intent** so the bot can detect image attachments, use message text for thread titles, and process prefix commands. Enable **Server Members Intent** for moderation and join-spike detection.