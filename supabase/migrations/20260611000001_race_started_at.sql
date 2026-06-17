alter table public.races
  add column started_at timestamptz;

update public.races
set started_at = created_at
where status = 'running' or turn_number > 1;
