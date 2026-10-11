'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ColorDto, ProductImageKind } from '@iphoneha/shared';
import { apiUpload } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const KINDS: { value: ProductImageKind; label: string }[] = [
  // shown floating over a glow in the colour's tint, so a plain or transparent background works best
  { value: 'DEVICE', label: 'کل گوشی' },
  // fills the frame and drifts slowly (camera, frame, a hand holding the phone…)
  { value: 'DETAIL', label: 'نمای نزدیک' },
];

/** Uploads a product photo; the API resizes it and stores it as WebP. */
export function ImageUploader({ productId, colors }: { productId: string; colors: ColorDto[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [colorId, setColorId] = useState<string>(colors[0]?.id ?? '');
  const [kind, setKind] = useState<ProductImageKind>('DEVICE');
  const [pending, setPending] = useState(false);

  async function upload(file: File) {
    setPending(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (colorId) form.append('colorId', colorId);
      form.append('kind', kind);
      await apiUpload(`/admin/products/${productId}/images`, form);
      toast.success('تصویر اضافه شد');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {colors.length > 0 ? (
        <Select value={colorId} onValueChange={setColorId}>
          <SelectTrigger className="h-9 w-40 text-[12px]" aria-label="رنگ تصویر">
            <SelectValue placeholder="رنگ" />
          </SelectTrigger>
          <SelectContent>
            {colors.map((color) => (
              <SelectItem key={color.id} value={color.id}>
                {color.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select value={kind} onValueChange={(value) => setKind(value as ProductImageKind)}>
        <SelectTrigger className="h-9 w-32 text-[12px]" aria-label="نوع تصویر">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KINDS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <Button size="sm" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ImagePlus className="size-4" aria-hidden />
        )}
        افزودن تصویر
      </Button>
      <span className="text-[11px] text-muted-faint">
        JPG، PNG، WebP یا AVIF تا ۸ مگابایت · «کل گوشی» با پس‌زمینهٔ ساده یا شفاف بهتر دیده می‌شود
      </span>
    </div>
  );
}
