-- Initial Flatmate Ledger data for Flat # 207
-- Login names are lowercase. Initial passwords match the display names.

delete from public.activity_log where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.cash_ledger where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.payments where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.expense_splits
where expense_id in (
  select id from public.expenses where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
delete from public.expenses where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.categories where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.house_invitations where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.house_members where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.houses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.users (
  id,
  phone,
  email,
  contact,
  full_name,
  avatar_url,
  default_currency,
  locale,
  password_hash,
  password_salt,
  password_algorithm,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    null,
    null,
    'asfandyar',
    'Sheikh Asfandyar',
    '/avatars/asfandyar.jpg',
    'PKR',
    'en-PK',
    'af3392569082ea10d8ba09bae126566f52aea73bbeab9f3824340fcdd49d977dc24d2c43a893ed5c3c9309f417f72d3d8f6ee3a23431013dd4bb930af5fc2448',
    'asfandyar-flat-207-salt',
    'scrypt',
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    null,
    null,
    'zahid-admin',
    'Zahid Admin',
    '/avatars/zahid.jpg',
    'PKR',
    'en-PK',
    'd351223ec2455769525f6177608ee914afbe7979e91d311b08bad7ee45d9cfdf990fba59478d442ffe7433be5627ac69a44fdf74c7a306f918303d37e63ce751',
    'zahid-admin-flat-207-salt',
    'scrypt',
    now(),
    now()
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    null,
    null,
    'zahid',
    'Zahid',
    '/avatars/zahid.jpg',
    'PKR',
    'en-PK',
    'b1caabf1d08684a6ec328d7a9892dadf4bd71aef501cb1a8ba09079744b9316c3d7118b67a9801a7b1eeee5e45706e767dc1ced02d28a8dcb789c3ad8e4090fe',
    'zahid-flat-207-salt',
    'scrypt',
    now(),
    now()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    null,
    null,
    'muavia',
    'Muavia',
    '/avatars/muavia.jpg',
    'PKR',
    'en-PK',
    '379117ad794a100a14e0e5a5a450aee37942dd606bec5bf34d5008195e01346ce1b8fbe9ecbbb666ddea6c51a963034d39038501173b3604895319c86ce3bdaf',
    'muavia-flat-207-salt',
    'scrypt',
    now(),
    now()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    null,
    null,
    'saad',
    'Saad',
    '/avatars/saad.jpg',
    'PKR',
    'en-PK',
    'e4743c74842b762980cc89532ba1b743f620c9d14a65ddcc3e262f95703723e228dac211e2f2ba05f07d959c94ca031c6122485609e7b8109366a798b6bf476f',
    'saad-flat-207-salt',
    'scrypt',
    now(),
    now()
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    null,
    null,
    'hassan',
    'Hassan',
    '/avatars/hassan.jpg',
    'PKR',
    'en-PK',
    'edeb7bc0da6342684bde6b4c7ad2a641eb1eb8591bde0981964216626deaa88d368688959888ff1353de595f023499f6e66d160aede91a43965fc50d49cfac45',
    'hassan-flat-207-salt',
    'scrypt',
    now(),
    now()
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    null,
    null,
    'shami',
    'Shami',
    '/avatars/shami.jpg',
    'PKR',
    'en-PK',
    '5cb57d59a95b2f2c554ebe9a5befc256ea491598ea544904b1ae764c1a3792f0222f88b7692eac38d62d7305110f10a56634a28a4e46107db6783d4d836abafa',
    'shami-flat-207-salt',
    'scrypt',
    now(),
    now()
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    null,
    null,
    'faisal',
    'Faisal',
    '/avatars/Faisal.jpg',
    'PKR',
    'en-PK',
    '214b641f2c942f3f5fbe04e6b283d1c27487313cecf9c16870e70b8b7e84c4cb3d746eed2b851a9981b1f5524ae8017fd7c5fe0cb1172dcb5768a4232408b32a',
    'faisal-flat-207-salt',
    'scrypt',
    now(),
    now()
  ),
  (
    '88888888-8888-8888-8888-888888888888',
    null,
    null,
    'maaz',
    'Maaz',
    '/avatars/maaz.jpg',
    'PKR',
    'en-PK',
    '3866b3779b16c77c617dc2b404eb1e8b09f9bfc947a5e9c89d78b74d5f0266da5d9d468f0c15e48a8a5263a1666c5966a8968494561008f444a09080dc13f9e6',
    'maaz-flat-207-salt',
    'scrypt',
    now(),
    now()
  )
on conflict (id) do update set
  contact = excluded.contact,
  full_name = excluded.full_name,
  avatar_url = excluded.avatar_url,
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  password_algorithm = excluded.password_algorithm,
  updated_at = now();

insert into public.houses (
  id,
  name,
  address,
  city,
  country,
  base_currency,
  timezone,
  created_by,
  current_month_start,
  current_month_end,
  created_at,
  updated_at
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Flat # 207',
  null,
  null,
  'PK',
  'PKR',
  'Asia/Karachi',
  '22222222-2222-2222-2222-222222222222',
  date_trunc('month', now())::date,
  (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  now(),
  now()
)
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  city = excluded.city,
  country = excluded.country,
  base_currency = excluded.base_currency,
  timezone = excluded.timezone,
  created_by = excluded.created_by,
  current_month_start = excluded.current_month_start,
  current_month_end = excluded.current_month_end,
  updated_at = now();

insert into public.house_members (
  id,
  house_id,
  user_id,
  role,
  status,
  joined_at,
  left_at,
  room_name,
  phone_display,
  is_default_payer
)
values
  ('aaaaaaaa-0001-aaaa-0001-aaaaaaaa0001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'manager', 'active', now(), null, null, 'asfandyar', true),
  ('aaaaaaaa-0002-aaaa-0002-aaaaaaaa0002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin', 'active', now(), null, null, 'zahid-admin', false),
  ('aaaaaaaa-0003-aaaa-0003-aaaaaaaa0003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999', 'flatmate', 'active', now(), null, null, 'zahid', false),
  ('aaaaaaaa-0004-aaaa-0004-aaaaaaaa0004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'flatmate', 'active', now(), null, null, 'muavia', false),
  ('aaaaaaaa-0005-aaaa-0005-aaaaaaaa0005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'flatmate', 'active', now(), null, null, 'saad', false),
  ('aaaaaaaa-0006-aaaa-0006-aaaaaaaa0006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'flatmate', 'active', now(), null, null, 'hassan', false),
  ('aaaaaaaa-0007-aaaa-0007-aaaaaaaa0007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'flatmate', 'active', now(), null, null, 'shami', false),
  ('aaaaaaaa-0008-aaaa-0008-aaaaaaaa0008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777', 'flatmate', 'active', now(), null, null, 'faisal', false),
  ('aaaaaaaa-0009-aaaa-0009-aaaaaaaa0009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 'flatmate', 'active', now(), null, null, 'maaz', false)
on conflict (house_id, user_id) do update set
  role = excluded.role,
  status = excluded.status,
  phone_display = excluded.phone_display,
  is_default_payer = excluded.is_default_payer;

insert into public.categories (id, house_id, name, icon, color, is_system, created_at)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rent', 'home', '#5FE3B3', true, now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Utilities', 'bolt', '#70A6FF', true, now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Groceries', 'shopping_cart', '#FFC86B', true, now())
on conflict (id) do update set
  house_id = excluded.house_id,
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color,
  is_system = excluded.is_system;

insert into public.activity_log (id, house_id, actor_user_id, action_type, entity_type, entity_id, metadata_json, created_at)
values (
  '99999999-0001-9999-0001-999999990001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  'house.seeded',
  'house',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"name":"Flat # 207","admin":"Zahid Admin","manager":"Sheikh Asfandyar"}',
  now()
)
on conflict (id) do update set
  metadata_json = excluded.metadata_json,
  created_at = now();
