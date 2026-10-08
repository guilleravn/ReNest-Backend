import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReservationsModule } from './reservations/reservations.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    AuthModule,
    CategoriesModule,
    UsersModule,
    ListingsModule,
    ReservationsModule,
    StorageModule,
    UploadsModule,
  ],
})
export class AppModule {}
