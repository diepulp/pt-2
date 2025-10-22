-- Minimal seed data for local development resets
-- Seeds canonical contexts with a single casino, company, staff member, and player.

insert into company (id, name, legal_name)
values ('00000000-0000-0000-0000-000000000001', 'Acme Gaming', 'Acme Gaming Holdings LLC');

insert into casino (id, company_id, name, location, status)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'Acme Downtown',
  'Las Vegas, NV',
  'active'
);

insert into casino_settings (id, casino_id, gaming_day_start_time, timezone)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  time '06:00',
  'America/Los_Angeles'
);

insert into staff (id, casino_id, employee_id, first_name, last_name, email, role)
values (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000101',
  'staff_001',
  'Pat',
  'Admin',
  'pat.admin@example.com',
  'admin'
);

insert into player (id, first_name, last_name, birth_date)
values (
  '00000000-0000-0000-0000-000000000401',
  'Alex',
  'Customer',
  '1985-01-01'
);

insert into visit (id, player_id, casino_id, started_at)
values (
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000101',
  now()
);

insert into player_casino (player_id, casino_id, status)
values (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000101',
  'active'
);

insert into player_loyalty (player_id, casino_id, balance)
values (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000101',
  0
);

insert into game_settings (id, casino_id, game_type, min_bet, max_bet, rotation_interval_minutes)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000101',
  'blackjack',
  10,
  1000,
  30
);

insert into gaming_table (id, casino_id, label, pit, type, status)
values (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000101',
  'BJ-01',
  'Pit-A',
  'blackjack',
  'active'
);

insert into rating_slip (
  id,
  player_id,
  casino_id,
  visit_id,
  table_id,
  game_settings,
  average_bet,
  start_time,
  status
)
values (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000601',
  jsonb_build_object('game_type', 'blackjack', 'min_bet', 10, 'max_bet', 1000),
  50,
  now(),
  'open'
);
select rpc_create_financial_txn(
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000401',
  250,
  'cash_in',
  now(),
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000701'
);

insert into mtl_entry (
  id,
  patron_uuid,
  casino_id,
  staff_id,
  rating_slip_id,
  visit_id,
  amount,
  direction,
  area,
  created_at
) values (
  '00000000-0000-0000-0000-000000000a01',
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000901',
  250,
  'in',
  'cage',
  now()
);

insert into mtl_audit_note (
  id,
  mtl_entry_id,
  staff_id,
  note,
  created_at
) values (
  '00000000-0000-0000-0000-000000000a02',
  '00000000-0000-0000-0000-000000000a01',
  '00000000-0000-0000-0000-000000000301',
  'Initial CTR check logged from seed.',
  now()
);
