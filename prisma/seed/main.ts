import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from '../../src/config/env.validation.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { StorageService } from '../../src/storage/storage.service.js';
import { seed } from './seed.js';

// `npm run seed`. Builds the services by hand instead of booting Nest: tsx
// doesn't emit the decorator metadata Nest's injection relies on.
const config = new ConfigService<Env, true>(validateEnv(process.env));
const prisma = new PrismaService(config);
const storage = new StorageService(config);

try {
  await seed(prisma, storage);
  console.log('Demo seed done.');
} finally {
  await prisma.$disconnect();
  storage.onModuleDestroy();
}
