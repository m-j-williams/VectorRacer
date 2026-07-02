'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readJsonResponse } from '@/lib/http';

export default function BoardgameLanding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await fetch('/api/boardgame/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const result = await readJsonResponse(response);
    if (!response.ok) {
      setError(result.error ?? 'Unable to create the group.');
      setBusy(false);
      return;
    }
    router.push(`/tools/boardgame-leaderboard/${result.accessKey}`);
  }

  return (
    <form className="bgl-create-card" onSubmit={createGroup}>
      <label htmlFor="group-name">Name your gaming group</label>
      <div className="bgl-create-row">
        <input id="group-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Wednesday Night Crew" required />
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
      </div>
      {error && <p className="bgl-error" role="alert">{error}</p>}
      <small>Save the link on the next screen. Anyone with it can view and edit the group.</small>
    </form>
  );
}
