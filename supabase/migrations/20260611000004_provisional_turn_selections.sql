alter table public.turn_selections
  add column submitted boolean not null default true;
