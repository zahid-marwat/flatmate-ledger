-- Allows disputes to point to either an expense or a cash deposit/payment.
-- Run this once on existing Supabase databases before using deposit disputes.

alter table public.disputes
  alter column expense_id drop not null;

alter table public.disputes
  add column if not exists payment_id uuid references public.payments(id) on delete cascade;
