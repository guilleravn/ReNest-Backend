import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ListingsController } from './listings.controller.js';
import { MyListingsController } from './my-listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ListingsController, MyListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}
