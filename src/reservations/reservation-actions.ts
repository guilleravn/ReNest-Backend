export type ViewerRole = 'BUYER' | 'SELLER';

export interface ReservationActions {
  canConfirmHandover: boolean;
  canConfirmReception: boolean;
  canRate: boolean;
}

interface ReservationProgress {
  sellerHandedOverAt: Date | null;
  buyerReceivedAt: Date | null;
  hasRating: boolean;
}

// Computed server-side so the UI never re-implements the rules. The seller's
// handover never changes what the buyer can do.
export function reservationActions(
  role: ViewerRole,
  { sellerHandedOverAt, buyerReceivedAt, hasRating }: ReservationProgress,
): ReservationActions {
  const isBuyer = role === 'BUYER';
  return {
    canConfirmHandover: !isBuyer && sellerHandedOverAt === null,
    canConfirmReception: isBuyer && buyerReceivedAt === null,
    canRate: isBuyer && buyerReceivedAt !== null && !hasRating,
  };
}
