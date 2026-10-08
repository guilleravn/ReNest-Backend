import {
  fromHhmm,
  sellerRating,
  toHhmm,
  toPickupOption,
} from './listing-format.js';

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

describe('toPickupOption', () => {
  it('formats the times as "HH:mm" and keeps only the public fields', () => {
    const row = {
      id: 'option-1',
      listingId: 'listing-1',
      locationLabel: 'Plaza Principal',
      weekdays: ['MONDAY' as const, 'WEDNESDAY' as const],
      startTime: new Date('1970-01-01T18:30:00.000Z'),
      endTime: new Date('1970-01-01T20:00:00.000Z'),
      createdAt: new Date(),
    };

    expect(toPickupOption(row)).toEqual({
      id: 'option-1',
      locationLabel: 'Plaza Principal',
      weekdays: ['MONDAY', 'WEDNESDAY'],
      startTime: '18:30',
      endTime: '20:00',
    });
  });
});

describe('fromHhmm (LST-7, GEN-3)', () => {
  it('reads "HH:mm" as a time of day with no timezone shift (GEN-3)', () => {
    expect(fromHhmm('18:30').toISOString()).toBe('1970-01-01T18:30:00.000Z');
  });

  it('round-trips with toHhmm (LST-7)', () => {
    expect(toHhmm(fromHhmm('00:05'))).toBe('00:05');
  });
});
