import { PAYMENT_METHOD_INFO, type PaymentMethod } from '@iphoneha/shared';
import type { RedirectForm } from './providers/payment-provider.interface';

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * The bridge into a gateway entered by POST (Tara): a page that submits the
 * form kept on the payment as soon as it loads, with a button for a browser
 * without scripts. Nothing on it is secret — it is exactly what the gateway's
 * own plugin puts in the customer's browser.
 */
export function renderRedirectForm(input: {
  form: RedirectForm;
  method: PaymentMethod;
  orderNumber: string;
  expired: boolean;
  storeUrl: string;
  /** the one-time value the page's Content-Security-Policy allows its own style and script with */
  nonce: string;
}): string {
  const info = PAYMENT_METHOD_INFO[input.method];
  const fields = Object.entries(input.form.fields)
    .map(([name, value]) => `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`)
    .join('\n      ');
  const body = input.expired
    ? `<p class="lead">مهلت این پرداخت تمام شده است.</p>
      <p class="note">برای پرداخت دوباره، از صفحهٔ سفارش‌های خود در فروشگاه اقدام کنید.</p>
      <a class="btn" href="${escape(input.storeUrl)}/account/orders">سفارش‌های من</a>`
    : `<p class="lead">در حال انتقال به ${escape(info.name)}…</p>
      <form id="go" method="POST" action="${escape(input.form.action)}">
      ${fields}
      <button class="btn" type="submit">ادامه به ${escape(info.name)}</button>
      </form>
      <noscript><p class="note">برای ادامه روی دکمهٔ بالا بزنید.</p></noscript>
      <script nonce="${escape(input.nonce)}">document.getElementById('go').submit();</script>`;
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>انتقال به ${escape(info.name)} — سفارش ${escape(input.orderNumber)}</title>
<style nonce="${escape(input.nonce)}">
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f5f7;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#08090a;padding:16px}
  .card{width:min(420px,100%);background:#fff;border:1px solid rgba(12,16,24,.08);border-radius:20px;overflow:hidden;text-align:center}
  .head{padding:18px 20px;color:#fff;background:${escape(info.color)};font-weight:700;font-size:15px}
  .body{padding:28px 20px}
  .lead{margin:0 0 18px;font-size:15px;font-weight:600}
  .note{margin:14px 0 0;font-size:12px;color:#63676e;line-height:1.9}
  .btn{display:inline-block;box-sizing:border-box;width:100%;padding:13px 16px;border-radius:12px;border:0;background:${escape(info.color)};
       color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none}
</style>
</head>
<body>
  <main class="card">
    <div class="head">${escape(info.name)} — سفارش ${escape(input.orderNumber)}</div>
    <div class="body">
      ${body}
    </div>
  </main>
</body>
</html>`;
}

/** The policy of the bridge page: nothing but its own nonce'd style and script, and a form that may only go to the gateway. */
export function redirectFormCsp(form: RedirectForm, nonce: string): string {
  const gateway = new URL(form.action).origin;
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    `form-action ${gateway}`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
