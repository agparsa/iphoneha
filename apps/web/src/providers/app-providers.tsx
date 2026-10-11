'use client';

import { useState, type ReactNode } from 'react';
import { DirectionProvider } from '@radix-ui/react-direction';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import type { CartDto, StorefrontConfigDto, UserDto } from '@iphoneha/shared';
import { ApiError } from '@/lib/api/errors';
import { CartProvider } from './cart-provider';
import { SessionProvider } from './session-provider';
import { StoreConfigProvider } from './store-config-provider';

interface AppProvidersProps {
  children: ReactNode;
  config: StorefrontConfigDto;
  initialUser: UserDto | null;
  initialCart: CartDto | null;
}

export function AppProviders({ children, config, initialUser, initialCart }: AppProvidersProps) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <DirectionProvider dir="rtl">
        <StoreConfigProvider config={config}>
          <SessionProvider initialUser={initialUser}>
            <CartProvider initialCart={initialCart}>
              {children}
              <Toaster position="top-center" dir="rtl" closeButton richColors={false} />
            </CartProvider>
          </SessionProvider>
        </StoreConfigProvider>
      </DirectionProvider>
    </QueryClientProvider>
  );
}
