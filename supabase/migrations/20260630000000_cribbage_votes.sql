create table public.cribbage_votes (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null,
  hand_key text not null,
  crib_owner text not null check (crib_owner in ('player', 'opponent')),
  discard_key text not null,
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_date, hand_key, crib_owner, voter_id)
);

alter table public.cribbage_votes enable row level security;

create index cribbage_votes_challenge_idx
  on public.cribbage_votes (challenge_date, hand_key, crib_owner);

