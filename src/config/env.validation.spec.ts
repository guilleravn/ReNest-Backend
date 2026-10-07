import { validateEnv } from './env.validation.js';

const base = {
  DATABASE_URL: 'postgresql://renest:renest@localhost:5433/renest',
  JWT_SECRET: 'a-secret-of-at-least-16-chars',
};

describe('validateEnv JWT_EXPIRES_IN (AUTH-6)', () => {
  it('defaults to 1 day in seconds', () => {
    expect(validateEnv(base).JWT_EXPIRES_IN).toBe(86400);
  });

  it.each([
    ['1d', 86400],
    ['12h', 43200],
    ['30m', 1800],
    ['45s', 45],
    ['3600', 3600],
  ])('turns %s into %i seconds', (value, seconds) => {
    expect(validateEnv({ ...base, JWT_EXPIRES_IN: value }).JWT_EXPIRES_IN).toBe(
      seconds,
    );
  });

  it.each(['', '0', '1w', 'one day', '1.5h', '-1d'])('rejects %j', (value) => {
    expect(() => validateEnv({ ...base, JWT_EXPIRES_IN: value })).toThrow(
      /JWT_EXPIRES_IN/,
    );
  });
});
