'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { StorefrontConfigDto } from '@iphoneha/shared';

const StoreConfigContext = createContext<StorefrontConfigDto | null>(null);

export function StoreConfigProvider({
  config,
  children,
}: {
  config: StorefrontConfigDto;
  children: ReactNode;
}) {
  return <StoreConfigContext.Provider value={config}>{children}</StoreConfigContext.Provider>;
}

export function useStoreConfig(): StorefrontConfigDto {
  const value = useContext(StoreConfigContext);
  if (!value) throw new Error('useStoreConfig must be used inside <StoreConfigProvider>');
  return value;
}
