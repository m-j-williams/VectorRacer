alter table public.races
  add column show_current_velocity boolean not null default true,
  add column show_potential_endpoints boolean not null default true,
  add column show_chosen_velocity boolean not null default true;
