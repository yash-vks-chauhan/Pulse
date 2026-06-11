/**
 * Pure attribution rules: an order converts a communication when the customer
 * clicked or read it within the attribution window before the order was
 * placed. When several qualify, the most recent engagement wins (last-touch).
 */

export const ATTRIBUTION_WINDOW_HOURS = 72;
const HOUR_MS = 3_600_000;

export interface AttributableOrder {
  id: string;
  customerId: string;
  orderedAt: Date;
}

export interface EngagedCommunication {
  id: string;
  customerId: string;
  /** Time of the engagement (last event on the communication). */
  lastEventAt: Date;
}

export interface AttributionPlan {
  orderId: string;
  communicationId: string;
}

export function planAttribution(
  orders: AttributableOrder[],
  communications: EngagedCommunication[],
  windowHours: number = ATTRIBUTION_WINDOW_HOURS,
): AttributionPlan[] {
  const windowMs = windowHours * HOUR_MS;

  // Most recent engagement first, per customer.
  const byCustomer = new Map<string, EngagedCommunication[]>();
  for (const comm of communications) {
    const list = byCustomer.get(comm.customerId);
    if (list) list.push(comm);
    else byCustomer.set(comm.customerId, [comm]);
  }
  for (const list of byCustomer.values()) {
    list.sort((a, b) => b.lastEventAt.getTime() - a.lastEventAt.getTime());
  }

  const plans: AttributionPlan[] = [];
  for (const order of orders) {
    const candidates = byCustomer.get(order.customerId);
    if (!candidates) continue;
    const orderedAt = order.orderedAt.getTime();
    const match = candidates.find((comm) => {
      const engagedAt = comm.lastEventAt.getTime();
      return engagedAt <= orderedAt && engagedAt >= orderedAt - windowMs;
    });
    if (match) plans.push({ orderId: order.id, communicationId: match.id });
  }
  return plans;
}
