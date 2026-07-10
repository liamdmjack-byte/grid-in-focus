// Cloudflare Pages Function — Mini Megawatts leaderboard
// Deploy at: functions/api/scores.js in the repo root.
// Requires a KV namespace bound as `SCORES` in the Pages project settings.
//
// GET  /api/scores            -> { scores: [{n, h, d, m, t}, ...] }  (top 50 by homes)
// POST /api/scores            -> body {name, homes, days, mode}; returns {ok, rank, scores}

const KEY = 'leaderboard-v1';
const MAX_KEEP = 200;      // entries retained in KV
const MAX_RETURN = 50;     // entries returned to clients

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet({ env }) {
  const list = await load(env);
  return json({ scores: list.slice(0, MAX_RETURN) });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  // validation: keep it strict, this endpoint is public
  const name = String(body.name || '')
    .replace(/[^\p{L}\p{N} _\-'.!]/gu, '')   // letters, digits, spaces, light punctuation
    .trim()
    .slice(0, 20);
  const homes = Math.floor(Number(body.homes));
  const days = Math.floor(Number(body.days));
  const mode = ['easy', 'normal', 'hard'].includes(body.mode) ? body.mode : null;

  if (!name || !mode ||
      !Number.isFinite(homes) || homes < 0 || homes > 5_000_000 ||
      !Number.isFinite(days) || days < 0 || days > 5000) {
    return json({ error: 'invalid' }, 400);
  }

  const list = await load(env);
  const entry = { n: name, h: homes, d: days, m: mode, t: Date.now() };
  list.push(entry);
  list.sort((a, b) => b.h - a.h);
  const trimmed = list.slice(0, MAX_KEEP);
  await env.SCORES.put(KEY, JSON.stringify(trimmed));

  const idx = trimmed.indexOf(entry);
  return json({
    ok: true,
    rank: idx >= 0 ? idx + 1 : null,     // null: score didn't make the retained board
    scores: trimmed.slice(0, MAX_RETURN),
  });
}

async function load(env) {
  try {
    const raw = await env.SCORES.get(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
