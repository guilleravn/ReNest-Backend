import { z } from 'zod';

const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3600, d: 86400 } as const;

// "1d", "12h", "30m", "45s" or plain seconds ("3600"), parsed to seconds so the
// JWT expiry and the `expiresIn` returned to clients come from one number.
const durationInSeconds = z
  .string()
  .regex(
    /^[1-9]\d*[smhd]?$/,
    'must be a positive duration like 1d, 12h or 3600',
  )
  .transform((value) => {
    const unit = value.at(-1) as string;
    return unit in SECONDS_PER_UNIT
      ? Number(value.slice(0, -1)) *
          SECONDS_PER_UNIT[unit as keyof typeof SECONDS_PER_UNIT]
      : Number(value);
  });

// "https://a.app, https://b.app/" -> ["https://a.app", "https://b.app"]. Browsers
// send the origin without a trailing slash, so it is stripped here.
const originList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  )
  .pipe(z.array(z.url()));

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: durationInSeconds.prefault('1d'),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),
    S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    // Brute-force protection per client IP on the auth endpoints.
    AUTH_LOGIN_LIMIT: z.coerce.number().int().positive().default(5),
    AUTH_LOGIN_WINDOW: durationInSeconds.prefault('1m'),
    AUTH_REGISTER_LIMIT: z.coerce.number().int().positive().default(10),
    AUTH_REGISTER_WINDOW: durationInSeconds.prefault('1h'),
    // Reverse proxies in front of the API whose X-Forwarded-For is trusted.
    // Defaults to 1 in production (Railway) and 0 elsewhere.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).optional(),
    CORS_ORIGIN: originList.optional(),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.CORS_ORIGIN?.length, {
    path: ['CORS_ORIGIN'],
    message: 'is required when NODE_ENV=production',
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
