'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { useCart } from '@/providers/cart-provider';
import { useSession } from '@/providers/session-provider';

export function LogoutButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const { setUser } = useSession();
  const { refresh: refreshCart } = useCart();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await api.post('/auth/logout');
      setUser(null);
      await refreshCart();
      toast.success('از حساب خارج شدی');
      router.replace('/');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className={className} onClick={logout} disabled={pending}>
      {children}
    </button>
  );
}
