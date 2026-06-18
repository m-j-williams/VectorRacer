alter table public.participants
  add column checkpoint_crossed boolean not null default false;
