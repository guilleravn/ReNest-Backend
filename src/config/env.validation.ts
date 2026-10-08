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

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: durationInSeconds.prefault('1d'),
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
