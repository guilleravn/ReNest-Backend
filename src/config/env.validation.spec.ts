import { validateEnv } from './env.validation.js';

const base = {
  DATABASE_URL: 'postgresql://renest:renest@localhost:5433/renest',
  JWT_SECRET: 'a-secret-of-at-least-16-chars',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'renest-photos',
  S3_ACCESS_KEY_ID: 'renest',
  S3_SECRET_ACCESS_KEY: 'renest-secret',
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

describe('validateEnv: storage', () => {
  it('reads S3_FORCE_PATH_STYLE=false as false', () => {
    const env = validateEnv({ ...base, S3_FORCE_PATH_STYLE: 'false' });

    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('reads S3_FORCE_PATH_STYLE=true as true', () => {
    const env = validateEnv({ ...base, S3_FORCE_PATH_STYLE: 'true' });

    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('defaults to virtual-hosted style and a one-hour presign TTL', () => {
    const env = validateEnv(base);

    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.S3_PRESIGN_TTL_SECONDS).toBe(3600);
  });

  it('rejects a missing bucket', () => {
    const { S3_BUCKET: _, ...withoutBucket } = base;

    expect(() => validateEnv(withoutBucket)).toThrow(/S3_BUCKET/);
  });
});
