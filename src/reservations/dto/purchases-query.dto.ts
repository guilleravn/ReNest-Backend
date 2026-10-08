import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const PURCHASE_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export class PurchasesQueryDto {
  @ApiProperty({
    enum: PURCHASE_STATUSES,
    description:
      'IN_PROGRESS = tab "Agendados", COMPLETED = tab "Completados".',
  })
  @IsIn(PURCHASE_STATUSES)
  status!: PurchaseStatus;
}
