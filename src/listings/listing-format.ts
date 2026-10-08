import type { Weekday } from '../generated/prisma/enums.js';
import type { PickupOptionDto } from './dto/listing-detail.dto.js';

export interface SellerRating {
  average: number | null;
  count: number;
}

// Rounds from the integer sum so halves don't drift (97 / 20 → 4.9, not 4.8).
export function sellerRating(
  starsSum: number | null,
  count: number,
): SellerRating {
  if (count === 0) return { average: null, count };
  return { average: Math.round(((starsSum ?? 0) * 10) / count) / 10, count };
}

// Prisma reads a Postgres `time` as a Date on 1970-01-01 UTC.
export function toHhmm(time: Date): string {
  return time.toISOString().slice(11, 16);
}

export interface PickupOptionRow {
  id: string;
  locationLabel: string;
  weekdays: Weekday[];
  startTime: Date;
  endTime: Date;
}

export function toPickupOption(option: PickupOptionRow): PickupOptionDto {
  return {
    id: option.id,
    locationLabel: option.locationLabel,
    weekdays: option.weekdays,
    startTime: toHhmm(option.startTime),
    endTime: toHhmm(option.endTime),
  };
}
