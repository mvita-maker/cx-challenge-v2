# CX Challenge — Cocos Capital

Portal interno de quizzes y evaluaciones para el equipo CX.

## Stack
- **Frontend:** HTML + CSS + JS vanilla (sin frameworks)
- **Backend:** Node.js (Vercel Serverless Functions)
- **Base de datos:** Supabase (PostgreSQL)
- **Emails:** Resend

## Estructura
```
cx-challenge/
├── public/
│   └── index.html        # Portal completo (frontend)
├── api/
│   ├── notify.js         # Envía notificación de nuevo quiz
│   └── reminder.js       # Envía recordatorio a quienes no hicieron el quiz
├── package.json
├── vercel.json
└── README.md
```

## Variables de entorno (Vercel)
| Variable | Descripción |
|----------|-------------|
| `RESEND_API_KEY` | API key de Resend para envío de emails |
| `SUPA_URL` | URL del proyecto Supabase |
| `SUPA_KEY` | Anon key de Supabase |
| `PORTAL_URL` | URL del portal en producción |

## Tablas Supabase requeridas
```sql
cx_users, cx_quiz, cx_results, cx_resources, cx_evaluaciones, cx_eval_resultados
```

## Deploy
Conectar el repo a Vercel y configurar las variables de entorno.
