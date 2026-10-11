'use client';

import { useCallback } from 'react';
import { estimateInstallment } from '@iphoneha/shared';
import { useStoreConfig } from '@/providers/store-config-provider';

/**
 * Returns a helper that computes the cheapest monthly instalment for a price,
 * using the store's configured terms — the «قسطی از ماهانه …» line.
 */
export function useInstallmentEstimate(): (price: number) => number | null {
  const { installments } = useStoreConfig();

  return useCallback(
    (price: number) => {
      if (!price || installments.length === 0) return null;
      let best: number | null = null;
      for (const term of installments) {
        const { monthly } = estimateInstallment(price, term, { months: term.maxInstallments });
        if (best === null || monthly < best) best = monthly;
      }
      return best;
    },
    [installments],
  );
}
