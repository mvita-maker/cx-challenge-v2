-- CX Challenge — PostgreSQL schema
-- Run this once in your Railway PostgreSQL database

CREATE TABLE IF NOT EXISTS cx_users (
  id      SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  pass    TEXT NOT NULL,
  role    TEXT NOT NULL DEFAULT 'agente',
  name    TEXT NOT NULL,
  email   TEXT
);

CREATE TABLE IF NOT EXISTS cx_quiz (
  id         SERIAL PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cx_results (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  week       TEXT NOT NULL,
  correct    INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  pct        INTEGER NOT NULL,
  date       TEXT NOT NULL,
  details    JSONB,
  questions  JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cx_resources (
  id    SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link  TEXT NOT NULL,
  cat   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cx_evaluaciones (
  id         SERIAL PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cx_eval_resultados (
  id           SERIAL PRIMARY KEY,
  eval_id      INTEGER NOT NULL,
  eval_nombre  TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  correct      INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  pct          INTEGER NOT NULL,
  minimo       INTEGER NOT NULL,
  fecha        TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'pendiente',
  details      JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
