'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { toPersianDigits, type UserDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useSession } from '@/providers/session-provider';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export function ProfileForm({ user }: { user: UserDto }) {
  const { setUser } = useSession();
  const [firstName, setFirstName] = useState(user.firstName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    try {
      const updated = await api.patch<UserDto>('/users/me', { firstName, lastName });
      setUser(updated);
      toast.success('اطلاعات ذخیره شد');
    } catch (cause) {
      if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length > 0)
        setErrors(cause.fieldErrors);
      else toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="نام" error={errors.firstName} htmlFor="firstName">
        <Input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
      </Field>
      <Field label="نام خانوادگی" error={errors.lastName} htmlFor="lastName">
        <Input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
      </Field>
      <Field label="شماره موبایل" hint="شماره موبایل قابل تغییر نیست." className="sm:col-span-2">
        <Input value={toPersianDigits(user.phone)} disabled dir="ltr" className="text-center font-display" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="md" loading={pending}>
          ذخیره تغییرات
        </Button>
      </div>
    </form>
  );
}
