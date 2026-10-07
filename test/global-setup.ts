import { execSync } from 'node:child_process';

// Creates the test database if needed and applies pending migrations.
// `deploy` never drops data; tests clean up their own rows.
export default function setup(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
  });
}
