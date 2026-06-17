update public.races
set
  track_config = jsonb_set(
    track_config,
    '{finish}',
    '[{"x": 6, "y": -2}, {"x": 9, "y": -2}]'::jsonb
  ),
  updated_at = now()
where track_config -> 'start' = '{"x": 8, "y": 0}'::jsonb
  and track_config -> 'finish' = '[{"x": 7, "y": -2}, {"x": 9, "y": -2}]'::jsonb
  and track_config -> 'points' @> '[{"x": 6, "y": -2}]'::jsonb;
