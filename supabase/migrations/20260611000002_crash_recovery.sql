alter table public.participants
  add column recovery_turns_remaining integer not null default 0
  check (recovery_turns_remaining >= 0);
