create extension if not exists pgcrypto;

create table if not exists public.boardgame_groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  access_key text not null unique check (char_length(access_key) >= 32),
  elo_starting_score integer not null default 1000 check (elo_starting_score between 0 and 10000),
  elo_sensitivity integer not null default 32 check (elo_sensitivity between 1 and 200)
);

create table if not exists public.boardgame_players (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  group_id uuid not null references public.boardgame_groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  unique (group_id, name)
);

create table if not exists public.boardgame_games (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  group_id uuid not null references public.boardgame_groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  unique (group_id, name)
);

create table if not exists public.boardgame_matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  group_id uuid not null references public.boardgame_groups(id) on delete cascade,
  game_id uuid not null references public.boardgame_games(id) on delete restrict,
  played_at timestamptz not null default now(),
  length_hours numeric(6,2),
  notes text
);

create table if not exists public.boardgame_match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.boardgame_matches(id) on delete cascade,
  player_id uuid not null references public.boardgame_players(id) on delete restrict,
  rank integer not null check (rank > 0),
  score numeric,
  unique (match_id, player_id)
);

create index if not exists boardgame_players_group_idx on public.boardgame_players(group_id);
create index if not exists boardgame_games_group_idx on public.boardgame_games(group_id);
create index if not exists boardgame_matches_group_idx on public.boardgame_matches(group_id, played_at desc);
create index if not exists boardgame_participants_match_idx on public.boardgame_match_participants(match_id);

alter table public.boardgame_groups enable row level security;
alter table public.boardgame_players enable row level security;
alter table public.boardgame_games enable row level security;
alter table public.boardgame_matches enable row level security;
alter table public.boardgame_match_participants enable row level security;

revoke all on public.boardgame_groups from anon, authenticated;
revoke all on public.boardgame_players from anon, authenticated;
revoke all on public.boardgame_games from anon, authenticated;
revoke all on public.boardgame_matches from anon, authenticated;
revoke all on public.boardgame_match_participants from anon, authenticated;

comment on column public.boardgame_groups.access_key is
  'Bearer-style secret embedded in the group URL. Possession grants read/write access through server routes.';
