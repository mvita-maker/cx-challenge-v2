import express from 'express';
import pkg from 'pg';
import cors from 'cors';

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const ALLOWED_TABLES = new Set([
  'cx_users', 'cx_quiz', 'cx_results', 'cx_resources',
  'cx_evaluaciones', 'cx_eval_resultados'
]);

// Columns that store JSON and need string→object conversion on INSERT/PATCH
const JSONB_COLS = {
  cx_quiz:             ['data'],
  cx_evaluaciones:     ['data'],
  cx_results:          ['details', 'questions'],
  cx_eval_resultados:  ['details']
};

function parseQuery(queryString) {
  if (!queryString) return { select: '*', filters: [], order: null, limit: null };

  const params = new URLSearchParams(queryString);
  let select = '*';
  const filters = [];
  let order = null;
  let limit = null;

  for (const [key, val] of params) {
    if (key === 'select') {
      select = val;
    } else if (key === 'order') {
      const dot = val.lastIndexOf('.');
      order = dot !== -1
        ? { col: val.slice(0, dot), dir: val.slice(dot + 1).toUpperCase() === 'DESC' ? 'DESC' : 'ASC' }
        : { col: val, dir: 'ASC' };
    } else if (key === 'limit') {
      limit = parseInt(val);
    } else {
      const dot = val.indexOf('.');
      if (dot !== -1) {
        const op = val.slice(0, dot);
        const v  = val.slice(dot + 1);
        const sqlOp = { eq: '=', gte: '>=', lte: '<=', gt: '>', lt: '<', neq: '!=' }[op];
        if (sqlOp) filters.push({ col: key, op: sqlOp, val: v });
      }
    }
  }

  return { select, filters, order, limit };
}

function coerceJsonb(table, key, value) {
  const cols = JSONB_COLS[table] || [];
  if (cols.includes(key) && typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

// ── Generic REST handler (PostgREST-compatible) ──────────────────────────────
app.all('/rest/v1/:table', async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(403).json({ error: 'Forbidden' });

  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
  const { select, filters, order, limit } = parseQuery(qs);

  const whereVals = filters.map(f => f.val);
  const where     = filters.length
    ? 'WHERE ' + filters.map((f, i) => `${f.col} ${f.op} $${i + 1}`).join(' AND ')
    : '';
  const orderSql = order ? `ORDER BY ${order.col} ${order.dir}` : '';
  const limitSql = limit ? `LIMIT ${limit}` : '';

  try {
    // GET ────────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const cols = select === '*' ? '*' : select.split(',').map(c => c.trim()).join(', ');
      const sql  = `SELECT ${cols} FROM ${table} ${where} ${orderSql} ${limitSql}`.replace(/\s+/g, ' ').trim();
      const result = await pool.query(sql, whereVals);
      return res.json(result.rows);
    }

    // POST ───────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body;
      const keys  = Object.keys(body);
      const vals  = keys.map(k => coerceJsonb(table, k, body[k]));
      const cols  = keys.join(', ');
      const phs   = keys.map((_, i) => `$${i + 1}`).join(', ');
      const sql   = `INSERT INTO ${table} (${cols}) VALUES (${phs}) RETURNING *`;
      const result = await pool.query(sql, vals);
      return res.status(201).json(result.rows);
    }

    // PATCH ──────────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const body   = req.body;
      const keys   = Object.keys(body);
      const setVals = keys.map(k => coerceJsonb(table, k, body[k]));
      const setCl   = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const whereOff = filters.map((f, i) => `${f.col} ${f.op} $${keys.length + i + 1}`);
      const whereSql = whereOff.length ? 'WHERE ' + whereOff.join(' AND ') : '';
      const sql = `UPDATE ${table} SET ${setCl} ${whereSql}`.trim();
      await pool.query(sql, [...setVals, ...whereVals]);
      return res.json({ success: true });
    }

    // DELETE ─────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!where) return res.status(400).json({ error: 'DELETE without WHERE is not allowed' });
      await pool.query(`DELETE FROM ${table} ${where}`, whereVals);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (e) {
    console.error('[DB]', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── Email: notify agents of new quiz ────────────────────────────────────────
app.post('/api/notify', async (req, res) => {
  const { quizName, quizDate, quizQuestions, agents } = req.body;
  if (!agents?.length) return res.status(400).json({ error: 'No agents provided' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const PORTAL_URL = process.env.PORTAL_URL || 'https://mvita-maker.github.io/cx-challenge-v2';
  if (!RESEND_KEY) return res.status(500).json({ error: 'Missing RESEND_API_KEY' });

  const results = await Promise.allSettled(
    agents.filter(a => a.email).map(agent =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'CX Challenge <onboarding@resend.dev>',
          to: agent.email,
          subject: `🎯 Nuevo quiz disponible — ${quizName}`,
          html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
            <div style="background:#001533;padding:32px 28px 24px">
              <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-.01em">CX <span style="color:#0062DE">·</span> Challenge</div>
            </div>
            <div style="padding:28px">
              <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#001533">¡Hola ${agent.name}! 👋</p>
              <p style="margin:0 0 20px;font-size:14px;color:#4A6080;line-height:1.6">Hay un nuevo quiz disponible para vos en el portal.</p>
              <div style="background:#F0F6FF;border:1.5px solid #C8DEFA;border-radius:10px;padding:16px 20px;margin-bottom:24px">
                <div style="font-size:15px;font-weight:700;color:#001533;margin-bottom:6px">${quizName}</div>
                <div style="font-size:13px;color:#4A6080">${quizQuestions} preguntas · ${quizDate}</div>
              </div>
              <a href="${PORTAL_URL}" style="display:inline-block;background:#0062DE;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">Ir al portal →</a>
              <p style="margin:24px 0 0;font-size:12px;color:#8AAEC8">Este mail fue enviado automáticamente desde CX Challenge.</p>
            </div>
          </div>`
        })
      })
    )
  );

  return res.json({
    sent:   results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length
  });
});

// ── Email: reminder to agents who haven't done the quiz ─────────────────────
app.post('/api/reminder', async (req, res) => {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const PORTAL_URL = process.env.PORTAL_URL || 'https://mvita-maker.github.io/cx-challenge-v2';
  if (!RESEND_KEY) return res.status(500).json({ error: 'Missing RESEND_API_KEY' });

  try {
    const { rows: quizzes } = await pool.query('SELECT * FROM cx_quiz ORDER BY id DESC LIMIT 1');
    if (!quizzes.length) return res.json({ message: 'No hay quiz activo' });
    const quiz = quizzes[0].data;

    const { rows: agents } = await pool.query(
      "SELECT user_id, name, email FROM cx_users WHERE role = 'agente' AND email IS NOT NULL AND email <> ''"
    );
    const { rows: done } = await pool.query('SELECT user_id FROM cx_results WHERE week = $1', [quiz.week]);
    const doneIds = new Set(done.map(r => r.user_id));
    const pending = agents.filter(a => !doneIds.has(a.user_id));

    if (!pending.length) return res.json({ message: 'Todos completaron el quiz', reminded: 0 });

    const emails = await Promise.allSettled(
      pending.map(agent =>
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'CX Challenge <onboarding@resend.dev>',
            to: agent.email,
            subject: '⏰ Recordatorio — Todavía no hiciste el quiz',
            html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
              <div style="background:#001533;padding:32px 28px 24px">
                <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-.01em">CX <span style="color:#0062DE">·</span> Challenge</div>
              </div>
              <div style="padding:28px">
                <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#001533">¡Hola ${agent.name}! 👋</p>
                <p style="margin:0 0 20px;font-size:14px;color:#4A6080;line-height:1.6">Todavía no completaste el quiz de esta semana. ¡Te quedó pendiente!</p>
                <div style="background:#FFF3E0;border:1.5px solid #F5C98A;border-radius:10px;padding:16px 20px;margin-bottom:24px">
                  <div style="font-size:15px;font-weight:700;color:#001533;margin-bottom:6px">${quiz.week}</div>
                  <div style="font-size:13px;color:#4A6080">${quiz.questions?.length ?? 0} preguntas · ${quiz.date}</div>
                </div>
                <a href="${PORTAL_URL}" style="display:inline-block;background:#0062DE;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">Hacer el quiz ahora →</a>
                <p style="margin:24px 0 0;font-size:12px;color:#8AAEC8">Este recordatorio fue enviado automáticamente desde CX Challenge.</p>
              </div>
            </div>`
          })
        })
      )
    );

    return res.json({ reminded: emails.filter(r => r.status === 'fulfilled').length, pending: pending.length });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CX Challenge API running on port ${PORT}`));
