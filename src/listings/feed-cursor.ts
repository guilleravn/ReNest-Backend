import { isUUID } from 'class-validator';

// The cursor is the last listing's id. Paging compares against that row inside
// Postgres, so `published_at` keeps its microseconds (a JS Date would round
// them to milliseconds and skip listings published in the same millisecond).
export function encodeFeedCursor(listingId: string): string {
  return Buffer.from(listingId, 'utf8').toString('base64url');
}

export function decodeFeedCursor(cursor: string): string | null {
  const id = Buffer.from(cursor, 'base64url').toString('utf8');
  return isUUID(id) ? id : null;
}
