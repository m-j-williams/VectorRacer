export function getInstructorKey() {
  const storageKey = 'vector-racer:instructor-key';
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  window.localStorage.setItem(storageKey, key);
  return key;
}
