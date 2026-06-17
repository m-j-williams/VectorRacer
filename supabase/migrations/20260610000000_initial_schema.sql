create extension if not exists pgcrypto;

create table public.races (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  instructor_key text not null,
  status text not null default 'lobby' check (status in ('lobby', 'running', 'finished')),
  track_config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  display_name text not null,
  color text not null,
  position_x integer not null,
  position_y integer not null,
  velocity_x integer not null default 0,
  velocity_y integer not null default 0,
  turn_count integer not null default 0,
  status text not null default 'racing' check (status in ('racing', 'crashed', 'finished')),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (race_id, display_name)
);

create table public.moves (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  turn_index integer not null,
  from_x integer not null,
  from_y integer not null,
  to_x integer not null,
  to_y integer not null,
  velocity_x integer not null,
  velocity_y integer not null,
  acceleration_x integer not null,
  acceleration_y integer not null,
  valid boolean not null,
  note text,
  created_at timestamptz not null default now()
);

alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.moves;

alter table public.races enable row level security;
alter table public.participants enable row level security;
alter table public.moves enable row level security;

create policy "Race participants are visible for live play"
  on public.participants for select
  to anon
  using (true);

create policy "Race moves are visible for live play"
  on public.moves for select
  to anon
  using (true);

create index races_instructor_key_idx on public.races(instructor_key);
create index races_code_idx on public.races(code);
create index participants_race_id_idx on public.participants(race_id);
create index moves_race_id_idx on public.moves(race_id);
create index moves_participant_id_idx on public.moves(participant_id);
