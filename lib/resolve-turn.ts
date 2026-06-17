import {
  applyAcceleration,
  crossesFinish,
  firstTrackExit,
  hillPushAt,
  nearestTrackPoint,
  recoveryTurnsForVelocity,
  segmentStaysOnTrack,
  validateTrackConfig,
  type ParticipantState,
  type TrackConfig,
  type Velocity
} from '@/lib/game';
import { createAdminClient } from '@/lib/supabase-admin';

type TurnRace = {
  id: string;
  code: string;
  status: 'lobby' | 'running' | 'finished';
  track_config: TrackConfig;
  turn_number: number;
  turn_duration_seconds: number;
  turn_deadline: string | null;
  paused_turn_seconds: number | null;
  turn_resolving: boolean;
};

type TurnSelection = {
  participant_id: string;
  acceleration_x: number;
  acceleration_y: number;
  submitted: boolean;
};

export async function resolveTurnByCode(code: string) {
  const admin = createAdminClient();
  const { data: race } = await admin
    .from('races')
    .select('id,code,status,track_config,turn_number,turn_duration_seconds,turn_deadline,paused_turn_seconds,turn_resolving')
    .eq('code', code.toUpperCase())
    .single<TurnRace>();

  if (
    !race ||
    race.status !== 'running' ||
    race.turn_resolving ||
    !race.turn_deadline ||
    !validateTrackConfig(race.track_config)
  ) {
    return false;
  }

  const [{ data: participants }, { data: selections }] = await Promise.all([
    admin
      .from('participants')
      .select('id,display_name,color,position_x,position_y,velocity_x,velocity_y,turn_count,recovery_turns_remaining,status')
      .eq('race_id', race.id)
      .eq('status', 'racing'),
    admin
      .from('turn_selections')
      .select('participant_id,acceleration_x,acceleration_y,submitted')
      .eq('race_id', race.id)
      .eq('turn_number', race.turn_number)
  ]);

  const activeParticipants = (participants || []) as ParticipantState[];
  if (activeParticipants.length === 0) {
    await admin
      .from('races')
      .update({ turn_deadline: null, turn_resolving: false, updated_at: new Date().toISOString() })
      .eq('id', race.id);
    return false;
  }

  const submittedIds = new Set(
    ((selections || []) as TurnSelection[])
      .filter((selection) => selection.submitted)
      .map((selection) => selection.participant_id)
  );
  const selectableParticipants = activeParticipants.filter((participant) => participant.recovery_turns_remaining === 0);
  const allSelected =
    selectableParticipants.length > 0 &&
    selectableParticipants.every((participant) => submittedIds.has(participant.id));
  const deadlineReached = Date.now() >= new Date(race.turn_deadline).getTime();
  if (!allSelected && !deadlineReached) return false;

  const { data: claim } = await admin
    .from('races')
    .update({ turn_resolving: true, updated_at: new Date().toISOString() })
    .eq('id', race.id)
    .eq('turn_number', race.turn_number)
    .eq('turn_resolving', false)
    .select('id')
    .maybeSingle();
  if (!claim) return false;

  try {
    const selectionMap = new Map<string, Velocity>(
      ((selections || []) as TurnSelection[]).map((selection) => [
        selection.participant_id,
        { x: selection.acceleration_x, y: selection.acceleration_y }
      ])
    );

    const moveRows = [];
    const participantRows = [];

    for (const participant of activeParticipants) {
      if (participant.recovery_turns_remaining > 0) {
        moveRows.push({
          race_id: race.id,
          participant_id: participant.id,
          turn_index: participant.turn_count + 1,
          from_x: participant.position_x,
          from_y: participant.position_y,
          to_x: participant.position_x,
          to_y: participant.position_y,
          velocity_x: 0,
          velocity_y: 0,
          acceleration_x: 0,
          acceleration_y: 0,
          valid: true,
          note: 'Recovering'
        });
        participantRows.push({
          ...participant,
          race_id: race.id,
          velocity_x: 0,
          velocity_y: 0,
          turn_count: participant.turn_count + 1,
          recovery_turns_remaining: participant.recovery_turns_remaining - 1,
          finished_at: null
        });
        continue;
      }

      const selectedAcceleration = selectionMap.get(participant.id) || { x: 0, y: 0 };
      const from = { x: participant.position_x, y: participant.position_y };
      const hillPush = hillPushAt(race.track_config, from);
      const acceleration = {
        x: selectedAcceleration.x + hillPush.x,
        y: selectedAcceleration.y + hillPush.y
      };
      const result = applyAcceleration(
        from,
        { x: participant.velocity_x, y: participant.velocity_y },
        acceleration
      );
      const valid = segmentStaysOnTrack(race.track_config, from, result.position);
      const didFinish =
        valid && crossesFinish(race.track_config, from, result.position, participant.turn_count + 1);
      const exitPoint = valid ? null : firstTrackExit(race.track_config, from, result.position);
      const resetPoint = exitPoint ? nearestTrackPoint(race.track_config, exitPoint) : result.position;
      const recoveryTurns = valid ? 0 : recoveryTurnsForVelocity(result.velocity);
      const nextStatus = didFinish ? 'finished' : 'racing';

      moveRows.push({
        race_id: race.id,
        participant_id: participant.id,
        turn_index: participant.turn_count + 1,
        from_x: from.x,
        from_y: from.y,
        to_x: result.position.x,
        to_y: result.position.y,
        velocity_x: result.velocity.x,
        velocity_y: result.velocity.y,
        acceleration_x: acceleration.x,
        acceleration_y: acceleration.y,
        valid,
        note: !valid
          ? recoveryTurns > 0
            ? `Left the track; recovering for ${recoveryTurns} round${recoveryTurns === 1 ? '' : 's'}`
            : 'Left the track; reset with no recovery delay'
          : didFinish
            ? 'Finished'
            : hillPush.x !== 0 || hillPush.y !== 0
              ? `Hill push (${hillPush.x}, ${hillPush.y})`
              : null
      });

      participantRows.push({
        id: participant.id,
        race_id: race.id,
        display_name: participant.display_name,
        color: participant.color,
        position_x: valid ? result.position.x : resetPoint.x,
        position_y: valid ? result.position.y : resetPoint.y,
        velocity_x: valid ? result.velocity.x : 0,
        velocity_y: valid ? result.velocity.y : 0,
        turn_count: participant.turn_count + 1,
        recovery_turns_remaining: recoveryTurns,
        status: nextStatus,
        finished_at: didFinish ? new Date().toISOString() : null
      });
    }

    const { error: moveError } = await admin.from('moves').insert(moveRows);
    if (moveError) throw moveError;

    const { error: participantError } = await admin
      .from('participants')
      .upsert(participantRows, { onConflict: 'id' });
    if (participantError) throw participantError;
    await admin
      .from('turn_selections')
      .delete()
      .eq('race_id', race.id)
      .eq('turn_number', race.turn_number);

    const nextDeadline = new Date(Date.now() + race.turn_duration_seconds * 1000).toISOString();
    await admin
      .from('races')
      .update({
        turn_number: race.turn_number + 1,
        turn_deadline: nextDeadline,
        paused_turn_seconds: null,
        turn_resolving: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', race.id);
    return true;
  } catch (error) {
    await admin.from('races').update({ turn_resolving: false }).eq('id', race.id);
    throw error;
  }
}
