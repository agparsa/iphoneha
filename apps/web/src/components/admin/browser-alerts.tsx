'use client';

import { useSyncExternalStore } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Permission = NotificationPermission | 'unsupported';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // the owner may also change it from the browser's own site settings
  let status: PermissionStatus | null = null;
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((result) => {
      status = result;
      result.onchange = listener;
    })
    .catch(() => undefined);
  window.addEventListener('focus', listener);
  return () => {
    listeners.delete(listener);
    if (status) status.onchange = null;
    window.removeEventListener('focus', listener);
  };
}

function currentPermission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** This browser's answer; null while rendering on the server. */
export function useNotificationPermission(): Permission | null {
  return useSyncExternalStore(subscribe, currentPermission, () => null);
}

/**
 * A system notification, for a panel tab that sits in the background. Only
 * when the owner allowed it for this browser; otherwise the toast is enough.
 */
export function notifyInBackground(title: string, body: string, onClick: () => void): void {
  if (currentPermission() !== 'granted' || document.visibilityState === 'visible') return;
  try {
    const notification = new Notification(title, {
      body,
      lang: 'fa',
      dir: 'rtl',
      icon: '/icon.png',
      // a second request replaces the first instead of stacking up
      tag: 'iphoneha-admin-alert',
    });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    // some mobile browsers only allow notifications from a service worker
  }
}

/**
 * «اعلان مرورگر»: asks this browser once; the answer is remembered by the
 * browser, per device. `compact` is the one-line version for a page header.
 */
export function BrowserAlertsToggle({ compact = false }: { compact?: boolean }) {
  const permission = useNotificationPermission();

  if (permission === null) return null;
  if (compact && permission !== 'default') {
    return permission === 'granted' ? (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-success">
        <BellRing className="size-3.5" aria-hidden />
        اعلان مرورگر روشن است
      </span>
    ) : null;
  }
  if (permission === 'unsupported') {
    return (
      <p className="text-[12px] leading-6 text-muted">
        این مرورگر اعلان سیستمی ندارد؛ هشدار داخل پنل نمایش داده می‌شود.
      </p>
    );
  }
  if (permission === 'granted') {
    return (
      <p className="inline-flex items-center gap-1.5 text-[12px] leading-6 text-success">
        <BellRing className="size-3.5" aria-hidden />
        اعلان مرورگر روی این دستگاه روشن است؛ وقتی پنل باز است و در زبانهٔ دیگری هستی، درخواست تازه خبر داده
        می‌شود.
      </p>
    );
  }
  if (permission === 'denied') {
    return (
      <p className="inline-flex items-center gap-1.5 text-[12px] leading-6 text-muted">
        <BellOff className="size-3.5" aria-hidden />
        اعلان این سایت در مرورگر مسدود است؛ از تنظیمات سایت در نوار نشانی مرورگر آن را «مجاز» کن.
      </p>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-fit justify-self-start"
      onClick={async () => {
        const answer = await Notification.requestPermission().catch(() => 'default' as const);
        listeners.forEach((listener) => listener());
        if (answer === 'granted') toast.success('اعلان مرورگر روشن شد');
      }}
    >
      <BellRing className="size-4" aria-hidden />
      روشن کردن اعلان مرورگر
    </Button>
  );
}
