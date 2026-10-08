import { sellerRating, toHhmm } from './listing-format.js';

describe('sellerRating (BRW-6)', () => {
  it('averages the stars to 1 decimal (BRW-6)', () => {
    expect(sellerRating(14, 3)).toEqual({ average: 4.7, count: 3 });
  });

  it('rounds a half up instead of losing it to floating point (BRW-6)', () => {
    // 97 / 20 = 4.85: a naive Math.round(4.85 * 10) gives 4.8.
    expect(sellerRating(97, 20)).toEqual({ average: 4.9, count: 20 });
  });

  it('keeps a whole average as a number, not a string (BRW-6)', () => {
    expect(sellerRating(10, 2)).toEqual({ average: 5, count: 2 });
  });

  it('has a null average when there are no ratings, not 0 (BRW-6)', () => {
    expect(sellerRating(null, 0)).toEqual({ average: null, count: 0 });
  });
});

describe('toHhmm', () => {
  it('formats a Postgres time as "HH:mm"', () => {
    expect(toHhmm(new Date('1970-01-01T09:05:00.000Z'))).toBe('09:05');
  });

  it('ignores the server timezone (times are stored as UTC)', () => {
    expect(toHhmm(new Date('1970-01-01T23:30:00.000Z'))).toBe('23:30');
  });
});
