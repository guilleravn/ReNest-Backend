import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

config({ quiet: true });

// e2e tests run against their own database, never the dev one.
const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL_TEST is not set (see .env.example).');
}
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL_TEST must differ from DATABASE_URL.');
}

// Same for photo storage: a bucket of their own.
const testBucket = process.env.S3_BUCKET_TEST;
if (!testBucket) {
  throw new Error('S3_BUCKET_TEST is not set (see .env.example).');
}
if (testBucket === process.env.S3_BUCKET) {
  throw new Error('S3_BUCKET_TEST must differ from S3_BUCKET.');
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // One shared database: run test files one after another.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      S3_BUCKET: testBucket,
      // Out of the way for the other specs; auth-rate-limit.e2e-spec.ts lowers them.
      AUTH_LOGIN_LIMIT: '10000',
      AUTH_REGISTER_LIMIT: '10000',
    },
  },
});
