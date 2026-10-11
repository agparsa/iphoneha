'use client';

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

export interface ProductSelection {
  variantId: string;
  price: number;
  /** «آبی یخی · ۲۵۶ گیگابایت» */
  label: string;
  available: boolean;
}

const SelectionContext = createContext<{
  selection: ProductSelection | null;
  setSelection: (selection: ProductSelection) => void;
} | null>(null);

/**
 * Shares the colour/capacity picked in the buy box with the rest of the
 * product page, so the instalment section quotes and buys that exact model.
 */
export function ProductSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<ProductSelection | null>(null);
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

const noSubscription = () => () => {};

/**
 * The shared selection — but while a component is still hydrating it sees
 * none, exactly like the server rendered it. The instalment section hydrates
 * in its own Suspense boundary, often after the buy box has already shared
 * its pick; reading that pick during hydration would not match the HTML.
 */
export function useProductSelection() {
  const context = useContext(SelectionContext);
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!context || hydrated) return context;
  return { ...context, selection: null };
}
