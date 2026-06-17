alter table public.races
  add column paused_turn_seconds integer check (paused_turn_seconds between 1 and 300);

update public.races
set paused_turn_seconds = turn_duration_seconds
where status = 'lobby';
