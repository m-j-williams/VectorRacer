alter table public.races
  alter column show_current_velocity set default false,
  alter column show_potential_endpoints set default false,
  alter column show_chosen_velocity set default false;
