import request from 'supertest';
import type { App } from 'supertest/types.js';

export function registerPayload(
  overrides: Record<string, unknown> = {},
): Record<string, string> {
  return {
    email: 'laura@example.com',
    password: 'correct-horse',
    fullName: 'Laura Gómez',
    phoneE164: '+59171234567',
    city: 'COCHABAMBA_BO',
    ...overrides,
  } as Record<string, string>;
}

/**
 * Registers a user through the real endpoint and returns a real token, so
 * authenticated tests exercise the guards. Use a distinct `email` override
 * when a test needs more than one user.
 */
export async function signUp(
  server: App,
  overrides: Record<string, unknown> = {},
): Promise<{ token: string; user: Record<string, unknown> }> {
  const res = await request(server)
    .post('/api/v1/auth/register')
    .send(registerPayload(overrides))
    .expect(201);
  return {
    token: res.body.accessToken as string,
    user: res.body.user as Record<string, unknown>,
  };
}
