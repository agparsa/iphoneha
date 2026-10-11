#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Helper of deploy/alerts.sh: asks the Telegram or Bale bot API about a bot.
//
// The token comes from the environment (ALERT_BOT_TOKEN, ALERT_BOT_SERVICE),
// never from the command line, so it does not show up in `ps`; it is never
// printed either. One result per line, for the shell script to read:
//
//   node alert-bot.mjs getme   →  OK <bot username>            | FAIL <reason>
//   node alert-bot.mjs chats   →  CHAT <id>\t<type>\t<name> …  | NONE | FAIL <reason>
//                                 (every chat that wrote to the bot, the newest last)
// ═══════════════════════════════════════════════════════════════════════════

const BASE = { telegram: 'https://api.telegram.org', bale: 'https://tapi.bale.ai' };
const service = process.env.ALERT_BOT_SERVICE === 'bale' ? 'bale' : 'telegram';
// tests only: a stand-in for the bot API (the store itself always talks to the real one)
const base = process.env.ALERT_BOT_API_BASE || BASE[service];
const token = process.env.ALERT_BOT_TOKEN ?? '';

const redact = (text) => (token ? String(text).replaceAll(token, '<token>') : String(text));
const oneLine = (text) =>
  String(text)
    .replace(/[\t\r\n]+/g, ' ')
    .trim();

async function call(method) {
  let response;
  try {
    response = await fetch(`${base}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const reason = error?.cause?.code ?? error?.cause?.message ?? error?.message ?? String(error);
    throw new Error(`no answer from ${service} (${reason})`);
  }
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`no answer from ${service} (HTTP ${response.status})`);
  }
  if (json?.ok !== true) throw new Error(`${json?.error_code ?? response.status} ${json?.description ?? ''}`);
  return json.result;
}

function chatName(chat) {
  if (chat.title) return chat.title;
  const person = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
  if (person) return person;
  return chat.username ? `@${chat.username}` : String(chat.id);
}

try {
  if (!token) throw new Error('ALERT_BOT_TOKEN is empty');
  const command = process.argv[2];
  if (command === 'getme') {
    const me = await call('getMe');
    console.log(`OK ${oneLine(me?.username ?? me?.first_name ?? me?.id ?? '?')}`);
  } else if (command === 'chats') {
    const updates = (await call('getUpdates')) ?? [];
    const chats = new Map();
    for (const update of updates) {
      const source = update.message ?? update.edited_message ?? update.channel_post ?? update.my_chat_member;
      const chat = source?.chat;
      if (!chat || chat.id === undefined) continue;
      chats.delete(chat.id); // keep the newest last
      chats.set(chat.id, `CHAT ${chat.id}\t${oneLine(chat.type ?? '?')}\t${oneLine(chatName(chat))}`);
    }
    console.log(chats.size ? [...chats.values()].join('\n') : 'NONE');
  } else {
    throw new Error(`unknown command "${command ?? ''}" (getme or chats)`);
  }
} catch (error) {
  console.log(`FAIL ${oneLine(redact(error?.message ?? error))}`);
}
