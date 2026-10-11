'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  SHIPPING_TIMES,
  SHIPPING_TIME_LABELS,
  type ColorDto,
  type ShippingTime,
  type StorageDto,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Adds a colour × capacity combination (with its opening stock) to a product. */
export function VariantCreateDialog({
  productId,
  productSlug,
  colors,
  storages,
}: {
  productId: string;
  productSlug: string;
  colors: ColorDto[];
  storages: StorageDto[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [colorId, setColorId] = useState(colors[0]?.id ?? '');
  const [storageId, setStorageId] = useState(storages[0]?.id ?? '');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [stock, setStock] = useState('0');
  const [shippingTime, setShippingTime] = useState<ShippingTime>(SHIPPING_TIMES[0]!);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  /** IPHONE-17-PRO-256-BLACK */
  function suggestedSku(): string {
    const storage = storages.find((item) => item.id === storageId);
    const color = colors.find((item) => item.id === colorId);
    return [productSlug, storage?.capacityGb, color?.code].filter(Boolean).join('-').toUpperCase();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    try {
      await api.post(`/admin/products/${productId}/variants`, {
        colorId,
        storageId,
        sku: (sku || suggestedSku()).toUpperCase(),
        price: Number(price),
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
        shippingTime,
        stock: Number(stock),
        lowStockThreshold: 2,
        isActive: true,
      });
      toast.success('ترکیب جدید اضافه شد');
      setOpen(false);
      setSku('');
      setPrice('');
      setCompareAtPrice('');
      setStock('0');
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
        <Button size="sm" variant="outline">
          <Plus className="size-4" aria-hidden />
          ترکیب جدید
        </Button>
      </DialogTrigger>
      <DialogContent title="ترکیب رنگ و حافظه" description="هر ترکیب قیمت، موجودی و SKU مستقل دارد.">
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="رنگ" error={errors.colorId}>
              <Select value={colorId} onValueChange={setColorId}>
                <SelectTrigger aria-label="رنگ">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colors.map((color) => (
                    <SelectItem key={color.id} value={color.id}>
                      {color.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="حافظه" error={errors.storageId}>
              <Select value={storageId} onValueChange={setStorageId}>
                <SelectTrigger aria-label="حافظه">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {storages.map((storage) => (
                    <SelectItem key={storage.id} value={storage.id}>
                      {storage.labelFa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="SKU" error={errors.sku} htmlFor="nv-sku" hint={`خالی بگذاری: ${suggestedSku()}`}>
            <Input
              id="nv-sku"
              dir="ltr"
              className="font-display uppercase"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="قیمت فروش (تومان)" error={errors.price} htmlFor="nv-price">
              <Input
                id="nv-price"
                inputMode="numeric"
                dir="ltr"
                className="font-display"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
            <Field label="قیمت قبل از تخفیف" error={errors.compareAtPrice} htmlFor="nv-compare">
              <Input
                id="nv-compare"
                inputMode="numeric"
                dir="ltr"
                className="font-display"
                value={compareAtPrice}
                onChange={(event) => setCompareAtPrice(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="موجودی اولیه" error={errors.stock} htmlFor="nv-stock">
              <Input
                id="nv-stock"
                inputMode="numeric"
                dir="ltr"
                className="font-display"
                value={stock}
                onChange={(event) => setStock(event.target.value)}
              />
            </Field>
            <Field label="زمان ارسال" error={errors.shippingTime}>
              <Select value={shippingTime} onValueChange={(value) => setShippingTime(value as ShippingTime)}>
                <SelectTrigger aria-label="زمان ارسال">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIPPING_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {SHIPPING_TIME_LABELS[time]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Button type="submit" size="md" loading={pending}>
            افزودن ترکیب
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
