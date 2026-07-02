-- Adds the admin house role and multi-payer expense support to an existing Supabase database.

alter type house_role add value if not exists 'admin' before 'manager';

alter table public.users
  add column if not exists password_hash text;

alter table public.users
  add column if not exists password_salt text;

alter table public.users
  add column if not exists password_algorithm text;

alter table public.expenses
  add column if not exists paid_by_user_id uuid references public.users(id) on delete set null;

alter table public.expenses
  add column if not exists payer_contributions_json jsonb not null default '[]'::jsonb;

alter table public.disputes
  add column if not exists house_id uuid references public.houses(id) on delete cascade;

update public.disputes d
set house_id = e.house_id
from public.expenses e
where d.expense_id = e.id
  and d.house_id is null;

create or replace function public.is_house_manager(house_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.house_members hm
    where hm.house_id = house_uuid
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role::text in ('admin', 'manager')
  );
$$;
