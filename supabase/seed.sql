-- Sample data for Flatmate Ledger

insert into public.users (id, phone, email, contact, full_name, avatar_url, default_currency, locale, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '+923001112222', 'ali@example.com', '+923001112222', 'Ali Khan', null, 'PKR', 'en-PK', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '+923003334444', 'sara@example.com', '+923003334444', 'Sara Ahmed', null, 'PKR', 'en-PK', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '+923005556666', 'hamza@example.com', '+923005556666', 'Hamza Malik', null, 'PKR', 'en-PK', now(), now()),
  ('44444444-4444-4444-4444-444444444444', '+923007778888', 'ayesha@example.com', '+923007778888', 'Ayesha Noor', null, 'PKR', 'en-PK', now(), now())
on conflict (id) do nothing;

insert into public.houses (id, name, address, city, country, base_currency, timezone, created_by, current_month_start, current_month_end, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Gulberg Flat 7B', 'House 14, Street 9', 'Lahore', 'PK', 'PKR', 'Asia/Karachi', '11111111-1111-1111-1111-111111111111', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date, now(), now())
on conflict (id) do nothing;

insert into public.house_members (id, house_id, user_id, role, status, joined_at, left_at, room_name, phone_display, is_default_payer)
values
  ('aaaaaaaa-0001-aaaa-0001-aaaaaaaa0001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'manager', 'active', now(), null, 'Room 1', '+92 300 1112222', true),
  ('aaaaaaaa-0002-aaaa-0002-aaaaaaaa0002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'flatmate', 'active', now(), null, 'Room 2', '+92 300 3334444', false),
  ('aaaaaaaa-0003-aaaa-0003-aaaaaaaa0003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'flatmate', 'active', now(), null, 'Room 3', '+92 300 5556666', false),
  ('aaaaaaaa-0004-aaaa-0004-aaaaaaaa0004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'flatmate', 'active', now(), null, 'Room 4', '+92 300 7778888', false)
on conflict (house_id, user_id) do nothing;

insert into public.categories (id, house_id, name, icon, color, is_system, created_at)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rent', 'home', '#5FE3B3', true, now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Utilities', 'bolt', '#70A6FF', true, now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Groceries', 'shopping_cart', '#FFC86B', true, now())
on conflict (id) do nothing;

insert into public.expenses (id, house_id, created_by, approved_by, category_id, title, note, amount_minor, currency, expense_date, due_date, split_type, status, is_recurring, recurrence_id, receipt_url, paid_by_user_id, created_at, updated_at)
values
  ('cccccccc-0001-cccc-0001-cccccccc0001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'June Rent', 'Monthly rent for June', 12000000, 'PKR', current_date, current_date + 2, 'equal_all', 'approved', false, null, null, '11111111-1111-1111-1111-111111111111', now(), now()),
  ('cccccccc-0002-cccc-0002-cccccccc0002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', 'Electricity Bill', 'May meter reading', 1850000, 'PKR', current_date - 2, current_date + 5, 'equal_selected', 'approved', false, null, null, '22222222-2222-2222-2222-222222222222', now(), now()),
  ('cccccccc-0003-cccc-0003-cccccccc0003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', null, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd', 'Groceries', 'Weekly grocery run', 720000, 'PKR', current_date - 1, current_date + 3, 'percentage', 'pending_approval', false, null, null, '33333333-3333-3333-3333-333333333333', now(), now())
on conflict (id) do nothing;

insert into public.expense_splits (id, expense_id, user_id, split_method, share_percent, share_amount_minor, owed_amount_minor, is_guest_assigned_to_host, created_at)
values
  ('dddddddd-0001-dddd-0001-dddddddd0001', 'cccccccc-0001-cccc-0001-cccccccc0001', '11111111-1111-1111-1111-111111111111', 'equal_all', null, null, 3000000, false, now()),
  ('dddddddd-0002-dddd-0002-dddddddd0002', 'cccccccc-0001-cccc-0001-cccccccc0001', '22222222-2222-2222-2222-222222222222', 'equal_all', null, null, 3000000, false, now()),
  ('dddddddd-0003-dddd-0003-dddddddd0003', 'cccccccc-0001-cccc-0001-cccccccc0001', '33333333-3333-3333-3333-333333333333', 'equal_all', null, null, 3000000, false, now()),
  ('dddddddd-0004-dddd-0004-dddddddd0004', 'cccccccc-0001-cccc-0001-cccccccc0001', '44444444-4444-4444-4444-444444444444', 'equal_all', null, null, 3000000, false, now()),
  ('dddddddd-0005-dddd-0005-dddddddd0005', 'cccccccc-0002-cccc-0002-cccccccc0002', '11111111-1111-1111-1111-111111111111', 'equal_selected', null, null, 925000, false, now()),
  ('dddddddd-0006-dddd-0006-dddddddd0006', 'cccccccc-0002-cccc-0002-cccccccc0002', '22222222-2222-2222-2222-222222222222', 'equal_selected', null, null, 925000, false, now()),
  ('dddddddd-0007-dddd-0007-dddddddd0007', 'cccccccc-0003-cccc-0003-cccccccc0003', '11111111-1111-1111-1111-111111111111', 'percentage', 40.0, null, 288000, false, now()),
  ('dddddddd-0008-dddd-0008-dddddddd0008', 'cccccccc-0003-cccc-0003-cccccccc0003', '22222222-2222-2222-2222-222222222222', 'percentage', 30.0, null, 216000, false, now()),
  ('dddddddd-0009-dddd-0009-dddddddd0009', 'cccccccc-0003-cccc-0003-cccccccc0003', '33333333-3333-3333-3333-333333333333', 'percentage', 20.0, null, 144000, false, now()),
  ('dddddddd-0010-dddd-0010-dddddddd0010', 'cccccccc-0003-cccc-0003-cccccccc0003', '44444444-4444-4444-4444-444444444444', 'percentage', 10.0, null, 72000, false, now())
on conflict (id) do nothing;

insert into public.payments (id, house_id, expense_id, payer_user_id, receiver_user_id, amount_minor, currency, method, payment_date, proof_url, confirmation_status, confirmed_by, confirmed_at, note, created_at)
values
  ('eeeeeeee-0001-eeee-0001-eeeeeeee0001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0001-cccc-0001-cccccccc0001', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 3000000, 'PKR', 'cash', current_date, null, 'confirmed', '11111111-1111-1111-1111-111111111111', now(), 'Cash handed to manager', now()),
  ('eeeeeeee-0002-eeee-0002-eeeeeeee0002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-0002-cccc-0002-cccccccc0002', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 925000, 'PKR', 'bank', current_date, null, 'pending', null, null, 'Awaiting confirmation', now())
on conflict (id) do nothing;

insert into public.cash_ledger (id, house_id, user_id, entry_type, amount_minor, currency, related_payment_id, related_expense_id, balance_after_minor, note, created_by, created_at)
values
  ('ffffffff-0001-ffff-0001-ffffffff0001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'cash_collected', 3000000, 'PKR', 'eeeeeeee-0001-eeee-0001-eeeeeeee0001', 'cccccccc-0001-cccc-0001-cccccccc0001', 3000000, 'Rent collection', '11111111-1111-1111-1111-111111111111', now())
on conflict (id) do nothing;

insert into public.activity_log (id, house_id, actor_user_id, action_type, entity_type, entity_id, metadata_json, created_at)
values
  ('99999999-0001-9999-0001-999999990001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'house.created', 'house', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"name":"Gulberg Flat 7B"}', now()),
  ('99999999-0002-9999-0002-999999990002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'expense.created', 'expense', 'cccccccc-0001-cccc-0001-cccccccc0001', '{"amountMinor":12000000}', now())
on conflict (id) do nothing;

