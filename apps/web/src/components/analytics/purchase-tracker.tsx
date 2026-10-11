'use client';

import { useEffect } from 'react';
import type { OrderDto } from '@iphoneha/shared';
import { trackPurchase } from '@/lib/analytics';

/** Reports a paid order to analytics once per browser tab, however often the result page reloads. */
export function PurchaseTracker({ order }: { order: OrderDto }) {
  useEffect(() => {
    const key = `ga-purchase:${order.orderNumber}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // storage blocked: GA still drops a repeated transaction id
    }
    trackPurchase(order);
  }, [order]);

  return null;
}
