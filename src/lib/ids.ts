/**
 * A new random id (UUID v4) for a row the app is about to write.
 *
 * Generated on the phone, before the save, so the save can be retried safely:
 * if the first attempt reached the database but its reply was lost, the retry
 * carries the same id and the database recognises it instead of writing the
 * money a second time.
 *
 * Uses the platform's crypto when it has one. The fallback isn't
 * cryptographically strong, and doesn't need to be: these ids only have to be
 * unique, not secret.
 */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
