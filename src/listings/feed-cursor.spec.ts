import { decodeFeedCursor, encodeFeedCursor } from './feed-cursor.js';

const ID = '0192d3a4-0000-7000-8000-0000000000a1';

describe('feed cursor (BRW-10)', () => {
  it('round-trips a listing id', () => {
    expect(decodeFeedCursor(encodeFeedCursor(ID))).toBe(ID);
  });

  it('is URL-safe, so it can go in a query string as is', () => {
    expect(encodeFeedCursor(ID)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a cursor that does not decode to a listing id', () => {
    expect(decodeFeedCursor(encodeFeedCursor('not-a-uuid'))).toBeNull();
  });

  it('rejects a cursor that is not base64url', () => {
    expect(decodeFeedCursor('%%%')).toBeNull();
  });

  it('rejects an empty cursor', () => {
    expect(decodeFeedCursor('')).toBeNull();
  });
});
