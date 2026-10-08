import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { MyPurchasesController } from './my-purchases.controller.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ReservationsController, MyPurchasesController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
