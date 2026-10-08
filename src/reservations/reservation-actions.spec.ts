import { reservationActions } from './reservation-actions.js';

const open = {
  sellerHandedOverAt: null,
  buyerReceivedAt: null,
  hasRating: false,
};
const at = new Date('2026-10-05T12:00:00.000Z');

describe('reservationActions', () => {
  it('lets the seller confirm the handover while it is not confirmed (SAL-4)', () => {
    expect(reservationActions('SELLER', open)).toEqual({
      canConfirmHandover: true,
      canConfirmReception: false,
      canRate: false,
    });
  });

  it('stops offering the handover once the seller confirmed it (SAL-4)', () => {
    const actions = reservationActions('SELLER', {
      ...open,
      sellerHandedOverAt: at,
    });

    expect(actions.canConfirmHandover).toBe(false);
  });

  it('never offers the seller the buyer actions (SAL-4, PUR-7, PUR-8)', () => {
    const actions = reservationActions('SELLER', {
      ...open,
      buyerReceivedAt: at,
    });

    expect(actions).toEqual({
      canConfirmHandover: true,
      canConfirmReception: false,
      canRate: false,
    });
  });

  it('lets the buyer confirm reception before rating is possible (PUR-7, PUR-8)', () => {
    expect(reservationActions('BUYER', open)).toEqual({
      canConfirmHandover: false,
      canConfirmReception: true,
      canRate: false,
    });
  });

  it('keeps the buyer actions after the seller handed over (PUR-4, SAL-4)', () => {
    const actions = reservationActions('BUYER', {
      ...open,
      sellerHandedOverAt: at,
    });

    expect(actions.canConfirmReception).toBe(true);
  });

  it('lets the buyer rate once reception is confirmed and not yet rated (PUR-8)', () => {
    expect(
      reservationActions('BUYER', { ...open, buyerReceivedAt: at }),
    ).toEqual({
      canConfirmHandover: false,
      canConfirmReception: false,
      canRate: true,
    });
  });

  it('stops offering the rating once the buyer rated (PUR-8)', () => {
    const actions = reservationActions('BUYER', {
      ...open,
      buyerReceivedAt: at,
      hasRating: true,
    });

    expect(actions.canRate).toBe(false);
  });
});
