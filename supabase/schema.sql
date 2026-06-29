-- Flatmate Ledger initial schema for Supabase/Postgres

create extension if not exists pgcrypto;

do $$
begin
  create type house_role as enum ('manager', 'flatmate', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type house_member_status as enum ('active', 'invited', 'left', 'blocked');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type expense_status as enum ('draft', 'pending_approval', 'approved', 'rejected', 'disputed', 'settled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type payment_confirmation_status as enum ('pending', 'confirmed', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type upload_status as enum ('pending', 'uploaded', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  email text unique,
  contact text unique,
  full_name text not null,
  avatar_url text,
  default_currency text not null default 'PKR',
  locale text not null default 'en-PK',
  password_hash text,
  password_salt text,
  password_algorithm text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.houses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  country text not null default 'PK',
  base_currency text not null default 'PKR',
  timezone text not null default 'Asia/Karachi',
  created_by uuid references public.users(id) on delete set null,
  current_month_start date,
  current_month_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.house_members (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role house_role not null default 'flatmate',
  status house_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  room_name text,
  phone_display text,
  is_default_payer boolean not null default false,
  unique (house_id, user_id)
);

create table if not exists public.house_invitations (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  contact text not null,
  role house_role not null default 'flatmate',
  created_by uuid references public.users(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.auth_otps (
  id uuid primary key default gen_random_uuid(),
  contact text not null,
  code text not null,
  full_name text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.house_rules (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  rule_type text not null,
  rule_value_json jsonb not null default '{}'::jsonb,
  active_from date,
  active_to date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  house_id uuid references public.houses(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  paid_by_user_id uuid references public.users(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  note text,
  amount_minor bigint not null,
  currency text not null default 'PKR',
  expense_date date not null,
  due_date date,
  split_type text not null,
  status expense_status not null default 'draft',
  is_recurring boolean not null default false,
  recurrence_id uuid,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  split_method text not null,
  share_percent numeric(8,4),
  share_amount_minor bigint,
  owed_amount_minor bigint not null,
  is_guest_assigned_to_host boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  expense_id uuid references public.expenses(id) on delete set null,
  payer_user_id uuid not null references public.users(id) on delete cascade,
  receiver_user_id uuid references public.users(id) on delete set null,
  amount_minor bigint not null,
  currency text not null default 'PKR',
  method text not null,
  payment_date date not null,
  proof_url text,
  confirmation_status payment_confirmation_status not null default 'pending',
  confirmed_by uuid references public.users(id) on delete set null,
  confirmed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  algorithm_version text not null default 'v1',
  total_expenses_minor bigint not null default 0,
  total_payments_minor bigint not null default 0,
  net_balance_minor bigint not null default 0,
  generated_at timestamptz not null default now(),
  finalized_at timestamptz,
  finalized_by uuid references public.users(id) on delete set null
);

create table if not exists public.settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  amount_minor bigint not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  opened_by uuid not null references public.users(id) on delete cascade,
  reason text not null,
  status text not null default 'open',
  resolution_note text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  title text not null,
  amount_minor bigint not null,
  currency text not null default 'PKR',
  category_id uuid references public.categories(id) on delete set null,
  split_type text not null,
  recurrence_pattern_json jsonb not null default '{}'::jsonb,
  auto_create boolean not null default false,
  next_run_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_ledger (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  entry_type text not null,
  amount_minor bigint not null,
  currency text not null default 'PKR',
  related_payment_id uuid references public.payments(id) on delete set null,
  related_expense_id uuid references public.expenses(id) on delete set null,
  balance_after_minor bigint,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  file_name text not null,
  mime_type text,
  public_url text,
  upload_status upload_status not null default 'pending',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  house_id uuid references public.houses(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  delivery_status text not null default 'queued',
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  title text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  title text not null,
  quantity text,
  notes text,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_house_members_house_user on public.house_members(house_id, user_id);
create index if not exists idx_expenses_house_date_status on public.expenses(house_id, expense_date, status);
create index if not exists idx_expense_splits_expense_user on public.expense_splits(expense_id, user_id);
create index if not exists idx_payments_house_payer_date on public.payments(house_id, payer_user_id, payment_date);
create index if not exists idx_settlement_lines_settlement_from on public.settlement_lines(settlement_id, from_user_id);
create index if not exists idx_activity_log_house_created on public.activity_log(house_id, created_at);

create or replace function public.is_house_member(house_uuid uuid)
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
  );
$$;

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
      and hm.role = 'manager'
  );
$$;

alter table public.users enable row level security;
alter table public.houses enable row level security;
alter table public.house_members enable row level security;
alter table public.house_invitations enable row level security;
alter table public.house_rules enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.payments enable row level security;
alter table public.settlements enable row level security;
alter table public.settlement_lines enable row level security;
alter table public.comments enable row level security;
alter table public.disputes enable row level security;
alter table public.recurring_templates enable row level security;
alter table public.cash_ledger enable row level security;
alter table public.files enable row level security;
alter table public.activity_log enable row level security;
alter table public.notifications enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

do $$
begin
  create policy "users_select_own" on public.users for select using (auth.uid() = id);
  create policy "users_insert_own" on public.users for insert with check (auth.uid() = id);
  create policy "users_update_own" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "houses_select_members" on public.houses for select using (public.is_house_member(id));
  create policy "houses_insert_creator" on public.houses for insert with check (auth.uid() = created_by);
  create policy "houses_update_manager" on public.houses for update using (public.is_house_manager(id)) with check (public.is_house_manager(id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "house_members_select_member" on public.house_members for select using (public.is_house_member(house_id));
  create policy "house_members_insert_manager" on public.house_members for insert with check (public.is_house_manager(house_id));
  create policy "house_members_update_manager" on public.house_members for update using (public.is_house_manager(house_id)) with check (public.is_house_manager(house_id));
  create policy "house_members_delete_manager" on public.house_members for delete using (public.is_house_manager(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "house_invitations_select_manager" on public.house_invitations for select using (public.is_house_manager(house_id));
  create policy "house_invitations_insert_manager" on public.house_invitations for insert with check (public.is_house_manager(house_id));
  create policy "house_invitations_update_manager" on public.house_invitations for update using (public.is_house_manager(house_id)) with check (public.is_house_manager(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "house_rules_select_member" on public.house_rules for select using (public.is_house_member(house_id));
  create policy "house_rules_manage_manager" on public.house_rules for insert with check (public.is_house_manager(house_id));
  create policy "house_rules_update_manager" on public.house_rules for update using (public.is_house_manager(house_id)) with check (public.is_house_manager(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "categories_select_member" on public.categories for select using (house_id is null or public.is_house_member(house_id));
  create policy "categories_manage_manager" on public.categories for insert with check (house_id is null or public.is_house_manager(house_id));
  create policy "categories_update_manager" on public.categories for update using (house_id is null or public.is_house_manager(house_id)) with check (house_id is null or public.is_house_manager(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "expenses_select_member" on public.expenses for select using (public.is_house_member(house_id));
  create policy "expenses_insert_member" on public.expenses for insert with check (public.is_house_member(house_id));
  create policy "expenses_update_manager" on public.expenses for update using (public.is_house_manager(house_id)) with check (public.is_house_manager(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "expense_splits_select_member" on public.expense_splits for select using (
    exists (
      select 1
      from public.expenses e
      where e.id = expense_id and public.is_house_member(e.house_id)
    )
  );
  create policy "expense_splits_insert_manager" on public.expense_splits for insert with check (
    exists (
      select 1
      from public.expenses e
      where e.id = expense_id and public.is_house_manager(e.house_id)
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "payments_select_member" on public.payments for select using (public.is_house_member(house_id));
  create policy "payments_insert_member" on public.payments for insert with check (public.is_house_member(house_id));
  create policy "payments_update_manager" on public.payments for update using (public.is_house_manager(house_id)) with check (public.is_house_manager(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "settlements_select_member" on public.settlements for select using (public.is_house_member(house_id));
  create policy "settlements_insert_manager" on public.settlements for insert with check (public.is_house_manager(house_id));
  create policy "settlements_update_manager" on public.settlements for update using (public.is_house_manager(house_id)) with check (public.is_house_manager(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "settlement_lines_select_member" on public.settlement_lines for select using (
    exists (
      select 1
      from public.settlements s
      where s.id = settlement_id and public.is_house_member(s.house_id)
    )
  );
  create policy "settlement_lines_insert_manager" on public.settlement_lines for insert with check (
    exists (
      select 1
      from public.settlements s
      where s.id = settlement_id and public.is_house_manager(s.house_id)
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "comments_select_member" on public.comments for select using (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_house_member(e.house_id))
  );
  create policy "comments_insert_member" on public.comments for insert with check (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_house_member(e.house_id))
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "disputes_select_member" on public.disputes for select using (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_house_member(e.house_id))
  );
  create policy "disputes_insert_member" on public.disputes for insert with check (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_house_member(e.house_id))
  );
  create policy "disputes_update_manager" on public.disputes for update using (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_house_manager(e.house_id))
  ) with check (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_house_manager(e.house_id))
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "recurring_select_member" on public.recurring_templates for select using (public.is_house_member(house_id));
  create policy "recurring_manage_manager" on public.recurring_templates for insert with check (public.is_house_manager(house_id));
  create policy "recurring_update_manager" on public.recurring_templates for update using (public.is_house_manager(house_id)) with check (public.is_house_manager(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "cash_ledger_select_member" on public.cash_ledger for select using (public.is_house_member(house_id));
  create policy "cash_ledger_insert_manager" on public.cash_ledger for insert with check (public.is_house_manager(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "files_select_member" on public.files for select using (
    created_by = auth.uid()
  );
  create policy "files_insert_authenticated" on public.files for insert with check (auth.uid() = created_by);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "activity_log_select_member" on public.activity_log for select using (public.is_house_member(house_id));
  create policy "activity_log_insert_manager" on public.activity_log for insert with check (public.is_house_member(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "notifications_select_own" on public.notifications for select using (auth.uid() = user_id);
  create policy "notifications_update_own" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "shopping_lists_select_member" on public.shopping_lists for select using (public.is_house_member(house_id));
  create policy "shopping_lists_manage_member" on public.shopping_lists for insert with check (public.is_house_member(house_id));
  create policy "shopping_lists_update_member" on public.shopping_lists for update using (public.is_house_member(house_id)) with check (public.is_house_member(house_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "shopping_items_select_member" on public.shopping_list_items for select using (
    exists (select 1 from public.shopping_lists sl where sl.id = shopping_list_id and public.is_house_member(sl.house_id))
  );
  create policy "shopping_items_manage_member" on public.shopping_list_items for insert with check (
    exists (select 1 from public.shopping_lists sl where sl.id = shopping_list_id and public.is_house_member(sl.house_id))
  );
exception when duplicate_object then null;
end $$;
