alter table public.turn_selections
  drop constraint turn_selections_acceleration_x_check,
  drop constraint turn_selections_acceleration_y_check;

alter table public.turn_selections
  add constraint turn_selections_acceleration_x_check
    check (acceleration_x between -2 and 2),
  add constraint turn_selections_acceleration_y_check
    check (acceleration_y between -2 and 2),
  add constraint turn_selections_acceleration_total_check
    check (abs(acceleration_x) + abs(acceleration_y) <= 2);
