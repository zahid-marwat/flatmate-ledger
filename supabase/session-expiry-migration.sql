-- Adds server-side session expiry support for existing databases.
alter table public.sessions
  add column if not exists expires_at timestamptz;

create index if not exists sessions_expires_at_idx
  on public.sessions (expires_at);
