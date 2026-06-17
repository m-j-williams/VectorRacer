alter table public.races
  add column turn_number integer not null default 1,
  add column turn_duration_seconds integer not null default 20,
  add column turn_deadline timestamptz,
  add column turn_resolving boolean not null default false;

create table public.turn_selections (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  turn_number integer not null,
  acceleration_x integer not null check (acceleration_x between -1 and 1),
  acceleration_y integer not null check (acceleration_y between -1 and 1),
  created_at timestamptz not null default now(),
  unique (participant_id, turn_number)
);

alter table public.turn_selections enable row level security;

create index turn_selections_race_turn_idx
  on public.turn_selections(race_id, turn_number);
