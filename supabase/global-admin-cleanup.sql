-- Make the app admin a global admin, not a member of any group.
-- Run this once on existing Supabase databases that were seeded before this change.

alter table public.users
  add column if not exists app_role text not null default 'user';

delete from public.house_members
where user_id in (
  select id
  from public.users
  where app_role = 'admin'
     or id = '22222222-2222-2222-2222-222222222222'
);
