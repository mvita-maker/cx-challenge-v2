export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SUPA_URL = process.env.SUPA_URL;
  const SUPA_KEY = process.env.SUPA_KEY;
  const PORTAL_URL = process.env.PORTAL_URL || 'https://cx-challenge.vercel.app';

  if (!RESEND_KEY || !SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  async function sb(table, query = '') {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}${query}`, {
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`
      }
    });
    const text = await r.text();
    return text ? JSON.parse(text) : [];
  }

  try {
    const quizzes = await sb('cx_quiz', '?select=*&order=id.desc&limit=1');
    if (!quizzes.length) return res.status(200).json({ message: 'No hay quiz activo' });

    const quiz = quizzes[0].data;

    const agents = await sb('cx_users', '?role=eq.agente&select=user_id,name,email');
    const agentsWithEmail = agents.filter(a => a.email);

    const results = await sb('cx_results', `?week=eq.${encodeURIComponent(quiz.week)}&select=user_id`);
    const doneUserIds = new Set(results.map(r => r.user_id));

    const pending = agentsWithEmail.filter(a => !doneUserIds.has(a.user_id));

    if (!pending.length) {
      return res.status(200).json({ message: 'Todos completaron el quiz', reminded: 0 });
    }

    const emails = await Promise.allSettled(
      pending.map(agent =>
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'CX Challenge <onboarding@resend.dev>',
            to: agent.email,
            subject: `⏰ Recordatorio — Todavía no hiciste el quiz`,
            html: `
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
                <div style="background:#001533;padding:32px 28px 24px">
                  <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-.01em">CX <span style="color:#0062DE">·</span> Challenge</div>
                </div>
                <div style="padding:28px">
                  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#001533">¡Hola ${agent.name}! 👋</p>
                  <p style="margin:0 0 20px;font-size:14px;color:#4A6080;line-height:1.6">Todavía no completaste el quiz de esta semana. ¡Te quedó pendiente!</p>
                  <div style="background:#FFF3E0;border:1.5px solid #F5C98A;border-radius:10px;padding:16px 20px;margin-bottom:24px">
                    <div style="font-size:15px;font-weight:700;color:#001533;margin-bottom:6px">${quiz.week}</div>
                    <div style="font-size:13px;color:#4A6080">${quiz.questions.length} preguntas · ${quiz.date}</div>
                  </div>
                  <a href="${PORTAL_URL}" style="display:inline-block;background:#0062DE;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">Hacer el quiz ahora →</a>
                  <p style="margin:24px 0 0;font-size:12px;color:#8AAEC8">Este recordatorio fue enviado automáticamente desde CX Challenge.</p>
                </div>
              </div>
            `
          })
        })
      )
    );

    const sent = emails.filter(r => r.status === 'fulfilled').length;
    return res.status(200).json({ reminded: sent, pending: pending.length });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
