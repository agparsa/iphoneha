'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

/** Delete with a confirmation step — used for products, variants and images. */
export function ConfirmDelete({
  path,
  title,
  description,
  label = 'حذف',
  redirectTo,
  iconOnly = true,
}: {
  path: string;
  title: string;
  description: string;
  label?: string;
  redirectTo?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    try {
      await api.delete(path);
      toast.success('حذف شد');
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {iconOnly ? (
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-faint hover:text-danger"
            aria-label={title}
          >
            <Trash2 />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft">
            <Trash2 className="size-4" aria-hidden />
            {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <div className="flex gap-2">
          <Button variant="danger" size="md" loading={pending} onClick={remove}>
            بله، حذف کن
          </Button>
          <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
            انصراف
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
