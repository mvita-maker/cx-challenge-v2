export default async function handler(req, res) {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { quizName, quizDate, quizQuestions, agents } = req.body;

  if (!agents || !agents.length) {
    return res.status(400).json({ error: 'No agents provided' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const PORTAL_URL = process.env.PORTAL_URL || 'https://cx-challenge.vercel.app';

  if (!RESEND_KEY) {
    return res.status(500).json({ error: 'Missing RESEND_API_KEY' });
  }

  const results = await Promise.allSettled(
    agents
      .filter(a => a.email)
      .map(agent =>
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'CX Challenge <onboarding@resend.dev>',
            to: agent.email,
            subject: `🎯 Nuevo quiz disponible — ${quizName}`,
            html: `
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
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
              </div>
            `
          })
        })
      )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  return res.status(200).json({ sent, failed });
}
