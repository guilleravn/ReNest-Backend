import { execSync } from 'node:child_process';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { validateEnv } from '../src/config/env.validation.js';

// Creates the test database if needed and applies pending migrations.
// `deploy` never drops data; tests clean up their own rows.
// Also creates the test bucket if needed; tests write under unique keys.
export default async function setup(): Promise<void> {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
  });

  await ensureTestBucket();
}

// Parses env like the app does, so both agree on values such as
// S3_FORCE_PATH_STYLE.
async function ensureTestBucket(): Promise<void> {
  const env = validateEnv(process.env);
  const bucket = process.env.S3_BUCKET_TEST;
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    // Only a missing bucket is expected; wrong keys or a down server must fail.
    if (
      !(error instanceof S3ServiceException) ||
      error.$metadata.httpStatusCode !== 404
    ) {
      throw error;
    }
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } finally {
    client.destroy();
  }
}
