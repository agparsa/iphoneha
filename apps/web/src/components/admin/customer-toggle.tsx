'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Switch } from '@/components/ui/switch';

export function CustomerToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(isActive);
  const [pending, setPending] = useState(false);

  async function toggle(next: boolean) {
    setChecked(next);
    setPending(true);
    try {
      await api.patch(`/admin/users/${userId}`, { isActive: next });
      toast.success(next ? 'دسترسی کاربر فعال شد' : 'کاربر مسدود شد');
      router.refresh();
    } catch (error) {
      setChecked(!next);
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Switch checked={checked} onCheckedChange={toggle} disabled={pending} aria-label="فعال بودن کاربر" />
  );
}
