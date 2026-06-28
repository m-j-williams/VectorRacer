import {
  validateTrackConfig,
  type MoveState,
  type ParticipantState,
  type RaceState,
  type TrackConfig
} from '@/lib/game';
import { createAdminClient } from '@/lib/supabase-admin';

type RaceRow = {
  id: string;
  code: string;
  status: 'lobby' | 'running' | 'finished';
  track_config: TrackConfig;
  turn_number: number;
  turn_duration_seconds: number;
  turn_deadline: string | null;
  paused_turn_seconds: number | null;
  started_at: string | null;
  turn_resolving: boolean;
  show_current_velocity: boolean;
  show_potential_endpoints: boolean;
  show_chosen_velocity: boolean;
  participants: (ParticipantState & { created_at: string })[];
  moves: MoveState[];
  turn_selections: { participant_id: string; turn_number: number; submitted: boolean }[];
};

export async function getRaceStateByCode(code: string): Promise<RaceState | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('races')
    .select(
      `
      id,
      code,
      status,
      track_config,
      turn_number,
      turn_duration_seconds,
      turn_deadline,
      paused_turn_seconds,
      started_at,
      turn_resolving,
      show_current_velocity,
      show_potential_endpoints,
      show_chosen_velocity,
      participants (
        id,
        display_name,
        color,
        position_x,
        position_y,
        velocity_x,
        velocity_y,
        turn_count,
        recovery_turns_remaining,
        checkpoint_crossed,
        finish_turns,
        status,
        created_at
      ),
      moves (
        id,
        participant_id,
        turn_index,
        from_x,
        from_y,
        to_x,
        to_y,
        valid
      ),
      turn_selections (
        participant_id,
        turn_number,
        submitted
      )
    `
    )
    .eq('code', code.toUpperCase())
    .single<RaceRow>();

  if (error || !data || !validateTrackConfig(data.track_config)) return null;

  return {
    ...data,
    participants: (data.participants || [])
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ created_at, ...participant }) => participant),
    moves: (data.moves || []).sort((a, b) => a.turn_index - b.turn_index),
    submitted_participant_ids: (data.turn_selections || [])
      .filter((selection) => selection.turn_number === data.turn_number && selection.submitted)
      .map((selection) => selection.participant_id)
  };
}
