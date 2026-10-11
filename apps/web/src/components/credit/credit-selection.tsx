'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CreditMethod } from '@iphoneha/shared';

export interface CreditSelection {
  method: CreditMethod | null;
  modelSlug: string | null;
  months: number | null;
  /** the plan open in the calculator: a store method or a credit service (`SNAPPAY`) */
  planId: string | null;
}

interface CreditSelectionValue {
  selection: CreditSelection;
  update: (patch: Partial<CreditSelection>) => void;
  /** carries a plan picked in the calculator down to the request form and jumps there */
  request: (patch: Partial<CreditSelection>) => void;
}

const CreditSelectionContext = createContext<CreditSelectionValue | null>(null);

/**
 * Shared between the plan calculator and the request form on an instalment
 * page: the model, method and months chosen in one show up in the other.
 * A link from a product page (?model=iphone-17-pro-max) pre-selects that
 * model, and a service banner (?service=snappay) opens that service in the
 * calculator.
 */
export function CreditSelectionProvider({
  initialMethod = null,
  children,
}: {
  initialMethod?: CreditMethod | null;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<CreditSelection>({
    method: initialMethod,
    modelSlug: null,
    months: null,
    planId: null,
  });

  // the address is only readable after mount (the page itself is static)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const model = params.get('model');
    const months = Number(params.get('months'));
    const plan = params.get('service') ?? params.get('plan');
    if (model || months || plan) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable after mount
      setSelection((state) => ({
        ...state,
        modelSlug: model ?? state.modelSlug,
        months: Number.isInteger(months) && months > 0 ? months : state.months,
        planId: plan ? plan.toUpperCase() : state.planId,
      }));
    }
  }, []);

  const update = useCallback(
    (patch: Partial<CreditSelection>) => setSelection((state) => ({ ...state, ...patch })),
    [],
  );
  const request = useCallback(
    (patch: Partial<CreditSelection>) => {
      update(patch);
      const form = document.getElementById('request');
      form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => document.getElementById('credit-name')?.focus({ preventScroll: true }), 500);
    },
    [update],
  );

  const value = useMemo(() => ({ selection, update, request }), [selection, update, request]);
  return <CreditSelectionContext.Provider value={value}>{children}</CreditSelectionContext.Provider>;
}

export function useCreditSelection(): CreditSelectionValue | null {
  return useContext(CreditSelectionContext);
}
