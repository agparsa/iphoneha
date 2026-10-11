'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';

interface SessionValue {
  user: UserDto | null;
  isAuthenticated: boolean;
  needsProfile: boolean;
  refresh: () => Promise<void>;
  setUser: (user: UserDto | null) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: UserDto | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        // answers 200 for visitors too, so the browser logs no 401 on every page
        const { user } = await api.get<{ user: UserDto | null }>('/auth/session');
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.isAuth) return null;
        throw error;
      }
    },
    // `initialData: null` would count as fresh data and suppress the first
    // fetch, so the app would render as signed-out until the cache went stale.
    initialData: initialUser ?? undefined,
    staleTime: 30_000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);

  const setUser = useCallback(
    (user: UserDto | null) => {
      queryClient.setQueryData(queryKeys.me, user);
    },
    [queryClient],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user: data ?? null,
      isAuthenticated: Boolean(data),
      needsProfile: Boolean(data && !data.profileComplete),
      refresh,
      setUser,
    }),
    [data, refresh, setUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
