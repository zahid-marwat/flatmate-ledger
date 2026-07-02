-- Make the app admin a global admin, not a member of any group.
-- Run this once on existing Supabase databases that were seeded before this change.

delete from public.house_members
where user_id in (
  select id
  from public.users
  where contact in ('zahid-admin')
);
