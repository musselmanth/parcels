// Parcels playtest collector: a Cloudflare Worker that stores what the game reports in a D1
// (SQLite) database, plus a private page for reading it. See ../README.md for setup.
//
//   POST /api/events      a batch of play events from one session (the game sends one every ~20s,
//                         when the tab is hidden or closed, and right away when a board is finished)
//   POST /api/feedback    a feedback form entry
//   GET  /admin?key=...   private page: feedback, finished games, sessions, per-level summary
//   GET  /admin/export.csv?key=...&table=games|feedback|events|sessions   download as CSV
//
// The game posts with Content-Type text/plain (it's still JSON), which keeps the browser from
// sending an extra CORS "preflight" request first, and lets it use navigator.sendBeacon.

const MAX_BODY = 64 * 1024; // bytes per request
const MAX_EVENTS = 300; // events per batch
const MAX_DATA = 4096; // bytes of JSON per event

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (req.method === 'POST' && url.pathname === '/api/events')
        return json(await postEvents(req, env), cors);
      if (req.method === 'POST' && url.pathname === '/api/feedback')
        return json(await postFeedback(req, env), cors);
      if (req.method === 'GET' && url.pathname === '/admin') return await adminPage(url, env);
      if (req.method === 'GET' && url.pathname === '/admin/export.csv') return await exportCsv(url, env);
      if (url.pathname === '/') return new Response('Parcels playtest collector is running.\n');
      return new Response('Not found\n', { status: 404, headers: cors });
    } catch (e) {
      const status = e.status || 500;
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  },
};

// ---------------------------------------------------------------- receiving data

// Only the game's own sites may post (browsers enforce this using these headers).
function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return allowed.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
      }
    : {};
}
const fail = (status, message) => Object.assign(new Error(message), { status });
const json = (obj, headers) =>
  new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json', ...headers } });

async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw fail(413, 'too big');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw fail(400, 'not JSON');
  }
}
// Short, safe strings and numbers from untrusted input.
const str = (v, max = 64) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const int = (v) => (Number.isFinite(v) ? Math.round(v) : null);
const blob = (v, max = MAX_DATA) => {
  if (v == null) return null;
  const s = JSON.stringify(v);
  return s.length > max ? JSON.stringify({ truncated: true }) : s;
};

// Rough location of the player, as Cloudflare works it out from their connection: country, region,
// city and timezone. City-level at best, never precise, and the IP address itself isn't stored.
function locationOf(req) {
  const cf = req.cf || {};
  const loc = {
    country: str(cf.country, 8),
    region: str(cf.region, 64),
    city: str(cf.city, 64),
    timezone: str(cf.timezone, 64),
  };
  return Object.values(loc).some(Boolean) ? loc : null;
}

async function postEvents(req, env) {
  const body = await readBody(req);
  const player = str(body.player),
    session = str(body.session);
  if (!player || !session || !Array.isArray(body.events)) throw fail(400, 'needs player, session, events');
  const now = new Date().toISOString();
  const stmts = [];
  for (const e of body.events.slice(0, MAX_EVENTS)) {
    const type = str(e.type, 32);
    if (!type) continue;
    stmts.push(
      env.DB.prepare(
        'INSERT INTO events (received_at, player, session, type, t, level, board, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        now,
        player,
        session,
        type,
        int(e.t),
        str(e.level, 16),
        int(e.board),
        // the session's first event also records where the player is (roughly)
        blob(type === 'session_start' ? { ...(e.data || {}), location: locationOf(req) } : e.data),
      ),
    );
    // finished boards also go in their own table, for easy reading
    if (type === 'game_finished' && e.data) {
      const d = e.data;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO games (received_at, player, session, level, board, outcome, time_ms, misses, pops, hints,
            pairs, locks, score, stars, new_best, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          now,
          player,
          session,
          str(e.level, 16),
          int(e.board),
          str(d.outcome, 16),
          int(d.time),
          int(d.misses),
          int(d.pops),
          int(d.hints),
          int(d.pairs),
          int(d.locks),
          int(d.score),
          int(d.stars),
          d.newBest ? 1 : 0,
          blob(d),
        ),
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { ok: true, stored: stmts.length };
}

async function postFeedback(req, env) {
  const b = await readBody(req);
  const message = str(b.message, 5000),
    rating = int(b.rating);
  if (!message && !rating) throw fail(400, 'empty');
  await env.DB.prepare(
    'INSERT INTO feedback (received_at, player, session, rating, message, contact, context) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      new Date().toISOString(),
      str(b.player),
      str(b.session),
      rating >= 1 && rating <= 5 ? rating : null,
      message,
      str(b.contact, 200),
      blob({ ...(b.context || {}), location: locationOf(req) }),
    )
    .run();
  return { ok: true };
}

// ---------------------------------------------------------------- reading it (private)

function checkKey(url, env) {
  if (!env.ADMIN_KEY) throw fail(503, 'Set the ADMIN_KEY secret first: npx wrangler secret put ADMIN_KEY');
  if (url.searchParams.get('key') !== env.ADMIN_KEY) throw fail(401, 'Wrong or missing ?key=');
}

// One row per session: when it started and ended, the device, how much was played.
const SESSIONS_SQL = `
  SELECT session, player,
    MIN(received_at) AS started, MAX(received_at) AS last_seen,
    MAX(t) AS length_ms,
    SUM(type = 'board_open') AS boards_opened,
    SUM(type = 'game_finished') AS finished,
    SUM(type = 'parcel') AS parcels_made,
    SUM(type = 'miss') AS misses,
    SUM(type = 'hint') AS hints,
    MAX(CASE WHEN type = 'session_start' THEN data END) AS device
  FROM events GROUP BY session ORDER BY started DESC`;

const TABLES = {
  games: 'SELECT * FROM games ORDER BY id DESC',
  feedback: 'SELECT * FROM feedback ORDER BY id DESC',
  events: 'SELECT * FROM events ORDER BY id DESC LIMIT 50000',
  sessions: SESSIONS_SQL,
};

async function exportCsv(url, env) {
  checkKey(url, env);
  const table = url.searchParams.get('table');
  if (!TABLES[table]) throw fail(400, 'table must be one of: ' + Object.keys(TABLES).join(', '));
  const { results } = await env.DB.prepare(TABLES[table]).all();
  const cols = results.length ? Object.keys(results[0]) : [];
  const cell = (v) =>
    v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const csv = [cols.join(','), ...results.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="parcels-${table}.csv"`,
    },
  });
}

const esc = (v) =>
  v == null
    ? ''
    : String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mmss = (ms) =>
  ms == null ? '' : `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;
const day = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) : '');

function table(rows, cols) {
  if (!rows.length) return '<p class="none">Nothing yet.</p>';
  return (
    '<table><thead><tr>' +
    cols.map(([label]) => `<th>${esc(label)}</th>`).join('') +
    '</tr></thead><tbody>' +
    rows.map((r) => '<tr>' + cols.map(([, f]) => `<td>${f(r)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>'
  );
}

async function adminPage(url, env) {
  checkKey(url, env);
  const key = encodeURIComponent(url.searchParams.get('key'));
  const [feedback, games, summary, sessions, totals, countries] = await Promise.all([
    env.DB.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 200').all(),
    env.DB.prepare('SELECT * FROM games ORDER BY id DESC LIMIT 300').all(),
    env.DB.prepare(
      `SELECT level, COUNT(*) AS n, SUM(outcome = 'solved') AS solved, AVG(CASE WHEN outcome = 'solved' THEN time_ms END) AS avg_time,
        AVG(hints) AS hints, AVG(misses) AS misses, AVG(pops) AS pops, AVG(CASE WHEN outcome = 'solved' THEN score END) AS score
       FROM games GROUP BY level ORDER BY CASE level WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 ELSE 4 END`,
    ).all(),
    env.DB.prepare(SESSIONS_SQL + ' LIMIT 200').all(),
    env.DB.prepare(
      `SELECT (SELECT COUNT(DISTINCT player) FROM events) AS players, (SELECT COUNT(DISTINCT session) FROM events) AS sessions,
        (SELECT COUNT(*) FROM games) AS games, (SELECT COUNT(*) FROM feedback) AS feedback`,
    ).first(),
    env.DB.prepare(
      `SELECT COALESCE(json_extract(data, '$.location.country'), '?') AS country,
        COUNT(DISTINCT player) AS players, COUNT(*) AS sessions
       FROM events WHERE type = 'session_start' GROUP BY country ORDER BY players DESC, sessions DESC`,
    ).all(),
  ]);
  const n1 = (v) => (v == null ? '' : (Math.round(v * 10) / 10).toString());
  const stars = (n) => (n ? '★'.repeat(n) : '');
  const device = (d) => {
    try {
      const j = JSON.parse(d || '{}');
      return esc(
        [j.viewport, j.touch ? 'touch' : 'mouse', j.standalone ? 'installed app' : '', j.lang]
          .filter(Boolean)
          .join(' · '),
      );
    } catch (e) {
      return '';
    }
  };
  const place = (d) => {
    try {
      const l = JSON.parse(d || '{}').location || {};
      return esc([l.city, l.region, l.country].filter(Boolean).join(', '));
    } catch (e) {
      return '';
    }
  };
  const csv = (t) => `<a href="/admin/export.csv?key=${key}&table=${t}">${t}.csv</a>`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Parcels playtest data</title>
<style>
  body{font:14px/1.45 system-ui,sans-serif;margin:0;padding:20px;background:#0f0d22;color:#e9e6ff}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:28px 0 8px;color:#b3a9ff}
  .totals{color:#958fc4;margin-bottom:6px} .csv a{color:#ffd43b;margin-right:12px}
  table{border-collapse:collapse;width:100%;font-size:13px} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #2a2550;vertical-align:top}
  th{color:#958fc4;font-weight:600;position:sticky;top:0;background:#0f0d22}
  .msg{white-space:pre-wrap;max-width:520px} .none{color:#958fc4} .scroll{max-height:520px;overflow:auto}
  .solved{color:#2bff88} .revealed{color:#ff8aa0}
</style>
<h1>Parcels playtest data</h1>
<div class="totals">${totals.players} players · ${totals.sessions} sessions · ${totals.games} finished boards · ${totals.feedback} feedback</div>
<div class="csv">Download: ${['games', 'sessions', 'feedback', 'events'].map(csv).join('')}</div>

<h2>Feedback</h2>
<div class="scroll">${table(feedback.results, [
    ['When', (r) => esc(day(r.received_at))],
    ['Rating', (r) => esc(r.rating ? '★'.repeat(r.rating) : '')],
    ['Message', (r) => `<div class="msg">${esc(r.message)}</div>`],
    ['Contact', (r) => esc(r.contact)],
    [
      'Where',
      (r) => {
        try {
          const c = JSON.parse(r.context || '{}');
          return esc([c.screen, c.level, c.board && '#' + c.board].filter(Boolean).join(' '));
        } catch (e) {
          return '';
        }
      },
    ],
    ['Location', (r) => place(r.context)],
    ['Player', (r) => esc((r.player || '').slice(0, 8))],
  ])}</div>

<h2>Players by country</h2>
${table(countries.results, [
  ['Country', (r) => esc(r.country)],
  ['Players', (r) => esc(r.players)],
  ['Sessions', (r) => esc(r.sessions)],
])}

<h2>By level</h2>
${table(summary.results, [
  ['Level', (r) => esc(r.level)],
  ['Finished', (r) => esc(r.n)],
  ['Solved', (r) => esc(`${r.solved} (${Math.round((100 * r.solved) / r.n)}%)`)],
  ['Avg time (solved)', (r) => esc(mmss(r.avg_time))],
  ['Avg hints', (r) => esc(n1(r.hints))],
  ['Avg misses', (r) => esc(n1(r.misses))],
  ['Avg pops', (r) => esc(n1(r.pops))],
  ['Avg score (solved)', (r) => esc(r.score == null ? '' : Math.round(r.score))],
])}

<h2>Finished boards (latest 300)</h2>
<div class="scroll">${table(games.results, [
    ['When', (r) => esc(day(r.received_at))],
    ['Board', (r) => esc(`${r.level} #${r.board}`)],
    ['Outcome', (r) => `<span class="${esc(r.outcome)}">${esc(r.outcome)}</span>`],
    ['Time', (r) => esc(mmss(r.time_ms))],
    ['Hints', (r) => esc(r.hints)],
    ['Misses', (r) => esc(r.misses)],
    ['Pops', (r) => esc(r.pops)],
    ['Score', (r) => esc(r.score)],
    ['Stars', (r) => esc(stars(r.stars))],
    ['Best?', (r) => (r.new_best ? '🏁' : '')],
    ['Player', (r) => esc((r.player || '').slice(0, 8))],
  ])}</div>

<h2>Sessions (latest 200)</h2>
<div class="scroll">${table(sessions.results, [
    ['Started', (r) => esc(day(r.started))],
    ['Length', (r) => esc(mmss(r.length_ms))],
    ['Boards opened', (r) => esc(r.boards_opened)],
    ['Finished', (r) => esc(r.finished)],
    ['Parcels', (r) => esc(r.parcels_made)],
    ['Misses', (r) => esc(r.misses)],
    ['Hints', (r) => esc(r.hints)],
    ['Location', (r) => place(r.device)],
    ['Device', (r) => device(r.device)],
    ['Player', (r) => esc((r.player || '').slice(0, 8))],
  ])}</div>
<p class="totals">Every move is in events.csv (one row per event, with the session id, time and details).</p>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
