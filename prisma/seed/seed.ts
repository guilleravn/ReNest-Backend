import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { CATEGORIES, DEMO_PASSWORD, USERS } from './data.js';

// Idempotent: rows are matched by a unique key and created only when
// missing, so running it again changes nothing and keeps data created by hand.
export async function seed(
  prisma: PrismaClient,
  _storage: StorageService,
): Promise<void> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const user of Object.values(USERS)) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }
}
