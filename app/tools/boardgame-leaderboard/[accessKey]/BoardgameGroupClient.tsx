'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, Plus, Settings, Trash2, Trophy, Users } from 'lucide-react';
import { readJsonResponse } from '@/lib/http';

type Player = { id: string; name: string };
type Match = {
  id: string; played_at: string; length_hours: number | null; notes: string | null;
  game: { name: string } | null;
  participants: { player_id: string; rank: number; score: number | null; player: { name: string } | null }[];
};
type Rating = { playerId: string; playerName: string; gameId: string; gameName: string; elo: number; gamesPlayed: number };
type GroupData = {
  group: { name: string; elo_starting_score: number; elo_sensitivity: number };
  players: Player[]; games: { id: string; name: string }[]; matches: Match[]; ratings: Rating[];
};
type DraftPlayer = { name: string; rank: number; score: string };

export default function BoardgameGroupClient({ accessKey }: { accessKey: string }) {
  const [data, setData] = useState<GroupData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'record' | 'players' | 'settings'>('dashboard');
  const [players, setPlayers] = useState<DraftPlayer[]>([{ name: '', rank: 1, score: '' }, { name: '', rank: 2, score: '' }]);
  const [defaultPlayedAt] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  const load = useCallback(async () => {
    const response = await fetch(`/api/boardgame/groups/${encodeURIComponent(accessKey)}`, { cache: 'no-store' });
    const result = await readJsonResponse(response);
    if (!response.ok) { setError(result.error ?? 'Unable to load this group.'); return; }
    setData(result as GroupData);
    setError('');
  }, [accessKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const ratingsByGame = useMemo(() => {
    const grouped = new Map<string, Rating[]>();
    for (const rating of data?.ratings ?? []) grouped.set(rating.gameName, [...(grouped.get(rating.gameName) ?? []), rating]);
    return grouped;
  }, [data]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    const button = document.activeElement as HTMLButtonElement | null;
    if (button) { const old = button.textContent; button.textContent = 'Copied!'; setTimeout(() => { button.textContent = old; }, 1400); }
  }

  async function recordMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/boardgame/groups/${encodeURIComponent(accessKey)}/matches`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameName: form.get('gameName'), playedAt: form.get('playedAt'), lengthHours: form.get('lengthHours'), notes: form.get('notes'),
        participants: players
      })
    });
    const result = await readJsonResponse(response); setBusy(false);
    if (!response.ok) { setError(result.error ?? 'Unable to record match.'); return; }
    setPlayers([{ name: '', rank: 1, score: '' }, { name: '', rank: 2, score: '' }]);
    setTab('dashboard'); await load();
  }

  async function deleteMatch(id: string) {
    if (!window.confirm('Delete this match? Ratings will be recalculated.')) return;
    const response = await fetch(`/api/boardgame/groups/${encodeURIComponent(accessKey)}/matches/${id}`, { method: 'DELETE' });
    if (!response.ok) { const result = await readJsonResponse(response); setError(result.error ?? 'Unable to delete match.'); return; }
    await load();
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/boardgame/groups/${encodeURIComponent(accessKey)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.get('name'), eloStartingScore: Number(form.get('starting')), eloSensitivity: Number(form.get('sensitivity')) })
    });
    const result = await readJsonResponse(response); setBusy(false);
    if (!response.ok) { setError(result.error ?? 'Unable to save settings.'); return; }
    setTab('dashboard'); await load();
  }

  if (error && !data) return <div className="bgl-state"><Trophy size={36} /><h1>That group link didn’t work</h1><p>{error}</p></div>;
  if (!data) return <div className="bgl-state"><p>Loading the game table…</p></div>;

  return (
    <div className="bgl-app">
      <header className="bgl-header">
        <div><span className="eyebrow">Boardgame leaderboard</span><h1>{data.group.name}</h1></div>
        <button className="bgl-secondary" onClick={copyLink}><Clipboard size={16} /> Copy group link</button>
      </header>
      <nav className="bgl-tabs" aria-label="Group sections">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}><Trophy size={17} /> Dashboard</button>
        <button className={tab === 'record' ? 'active' : ''} onClick={() => setTab('record')}><Plus size={17} /> Record match</button>
        <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}><Users size={17} /> Players</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings size={17} /> Settings</button>
      </nav>
      {error && <p className="bgl-error" role="alert">{error}</p>}

      {tab === 'dashboard' && <div className="bgl-dashboard">
        <section className="bgl-panel bgl-wide">
          <div className="bgl-section-title"><div><span className="eyebrow">Rankings</span><h2>Leaderboards</h2></div><button onClick={() => setTab('record')}>Record a match</button></div>
          {ratingsByGame.size === 0 ? <div className="bgl-empty">Record the first match to start the rankings.</div> :
            <div className="bgl-leaderboard-grid">{[...ratingsByGame.entries()].map(([game, ratings]) => <article className="bgl-game-board" key={game}>
              <h3>{game}</h3>{ratings.sort((a, b) => b.elo - a.elo).map((rating, index) => <div className="bgl-rank" key={rating.playerId}><strong>{index + 1}</strong><span>{rating.playerName}<small>{rating.gamesPlayed} played</small></span><b>{Math.round(rating.elo)}</b></div>)}
            </article>)}</div>}
        </section>
        <section className="bgl-panel">
          <div className="bgl-section-title"><div><span className="eyebrow">History</span><h2>Recent matches</h2></div></div>
          {data.matches.length === 0 ? <div className="bgl-empty">No matches yet.</div> : <div className="bgl-match-list">{data.matches.map((match) => <article key={match.id} className="bgl-match">
            <div><h3>{match.game?.name}</h3><time>{new Date(match.played_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></div>
            <ol>{[...match.participants].sort((a, b) => a.rank - b.rank).map((p) => <li key={p.player_id}><span>{p.rank}. {p.player?.name}</span>{p.score != null && <b>{p.score}</b>}</li>)}</ol>
            {match.notes && <p>{match.notes}</p>}<button className="bgl-icon-danger" onClick={() => deleteMatch(match.id)} aria-label={`Delete ${match.game?.name} match`}><Trash2 size={16} /></button>
          </article>)}</div>}
        </section>
      </div>}

      {tab === 'record' && <section className="bgl-panel bgl-form-panel"><span className="eyebrow">New result</span><h2>Record a match</h2>
        <form onSubmit={recordMatch} className="bgl-form">
          <label>Game<input name="gameName" list="bgl-games" placeholder="Catan" required /></label><datalist id="bgl-games">{data.games.map((game) => <option key={game.id} value={game.name} />)}</datalist>
          <div className="bgl-form-row"><label>Date and time<input name="playedAt" type="datetime-local" defaultValue={defaultPlayedAt} required /></label><label>Hours<input name="lengthHours" type="number" min="0" step="0.25" placeholder="1.5" /></label></div>
          <fieldset><legend>Players and results</legend>{players.map((player, index) => <div className="bgl-player-row" key={index}>
            <label>Name<input list="bgl-players" value={player.name} onChange={(e) => setPlayers((current) => current.map((p, i) => i === index ? { ...p, name: e.target.value } : p))} required /></label>
            <label>Rank<input type="number" min="1" value={player.rank} onChange={(e) => setPlayers((current) => current.map((p, i) => i === index ? { ...p, rank: Number(e.target.value) } : p))} required /></label>
            <label>Score<input type="number" step="any" value={player.score} onChange={(e) => setPlayers((current) => current.map((p, i) => i === index ? { ...p, score: e.target.value } : p))} /></label>
            <button type="button" className="bgl-icon-danger" disabled={players.length <= 2} onClick={() => setPlayers((current) => current.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
          </div>)}<datalist id="bgl-players">{data.players.map((player) => <option key={player.id} value={player.name} />)}</datalist>
          <button type="button" className="bgl-secondary" onClick={() => setPlayers((current) => [...current, { name: '', rank: current.length + 1, score: '' }])}><Plus size={16} /> Add player</button></fieldset>
          <label>Notes<textarea name="notes" rows={3} placeholder="Optional notes about the game" /></label><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save match'}</button>
        </form>
      </section>}

      {tab === 'players' && <section className="bgl-panel bgl-form-panel"><span className="eyebrow">The table</span><h2>Players</h2>{data.players.length === 0 ? <div className="bgl-empty">Players are added automatically when you record a match.</div> : <div className="bgl-player-cards">{data.players.map((player) => { const games = data.ratings.filter((r) => r.playerId === player.id); return <article key={player.id}><div className="bgl-avatar">{player.name.slice(0, 1).toUpperCase()}</div><div><h3>{player.name}</h3><p>{games.reduce((sum, game) => sum + game.gamesPlayed, 0)} games across {games.length} titles</p></div></article>; })}</div>}</section>}

      {tab === 'settings' && <section className="bgl-panel bgl-form-panel"><span className="eyebrow">Configuration</span><h2>Group settings</h2><form onSubmit={saveSettings} className="bgl-form">
        <label>Group name<input name="name" defaultValue={data.group.name} maxLength={80} required /></label><div className="bgl-form-row"><label>Starting Elo<input name="starting" type="number" min="0" max="10000" defaultValue={data.group.elo_starting_score} required /></label><label>Sensitivity (K-factor)<input name="sensitivity" type="number" min="1" max="200" defaultValue={data.group.elo_sensitivity} required /></label></div><p className="bgl-hint">A higher sensitivity makes ratings move more after each result. Changing either Elo value recalculates the displayed ratings from match history.</p><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </form></section>}
    </div>
  );
}
