-- Replaces contact-based global admin checks with immutable user app roles.
alter table public.users
  add column if not exists app_role text not null default 'user';

do $$
begin
  alter table public.users
    add constraint users_app_role_check check (app_role in ('user', 'admin'));
exception
  when duplicate_object then null;
end $$;

-- One-time promotion for the existing bootstrap admin account.
update public.users
set app_role = 'admin',
    updated_at = now()
where id = '22222222-2222-2222-2222-222222222222'
   or contact = 'zahid-admin';

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert
  with check (auth.uid() = id and app_role = 'user');

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update
  using (auth.uid() = id and app_role = 'user')
  with check (auth.uid() = id and app_role = 'user');
