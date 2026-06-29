alter table public.users
add column if not exists password_hash text;

alter table public.users
add column if not exists password_salt text;

alter table public.users
add column if not exists password_algorithm text;

