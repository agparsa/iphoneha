'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  ROLE_PERMISSIONS,
  type AdminRole,
  type AdminUserDto,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

/** Creates or edits an admin account (SUPER_ADMIN only — enforced by the API too). */
export function AdminUserDialog({ admin }: { admin?: AdminUserDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(admin?.phone ?? '');
  const [name, setName] = useState(admin?.name ?? '');
  const [role, setRole] = useState<AdminRole>(admin?.role ?? 'SUPPORT');
  const [isActive, setIsActive] = useState(admin?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    try {
      if (admin) await api.patch(`/admin/admins/${admin.id}`, { name, role, isActive });
      else await api.post('/admin/admins', { phone, name, role, isActive: true });
      toast.success(admin ? 'مدیر به‌روز شد' : 'مدیر جدید اضافه شد');
      setOpen(false);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length > 0)
        setErrors(cause.fieldErrors);
      else toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {admin ? (
          <Button size="icon-sm" variant="ghost" aria-label={`ویرایش ${admin.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Plus className="size-4" aria-hidden />
            مدیر جدید
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={admin ? `ویرایش ${admin.name}` : 'مدیر جدید'}>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="شماره موبایل" error={errors.phone} htmlFor="admin-user-phone">
            <Input
              id="admin-user-phone"
              dir="ltr"
              className="font-display"
              value={phone}
              disabled={Boolean(admin)}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <Field label="نام" error={errors.name} htmlFor="admin-user-name">
            <Input id="admin-user-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field
            label="نقش"
            error={errors.role}
            hint={`${ADMIN_ROLE_LABELS[role]}: ${ROLE_PERMISSIONS[role].length} دسترسی`}
          >
            <Select value={role} onValueChange={(value) => setRole(value as AdminRole)}>
              <SelectTrigger aria-label="نقش">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {ADMIN_ROLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {admin ? (
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
              <span className="text-[13px] text-ink">حساب فعال است</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </label>
          ) : null}

          <Button type="submit" size="md" loading={pending}>
            {admin ? 'ذخیره' : 'افزودن مدیر'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
