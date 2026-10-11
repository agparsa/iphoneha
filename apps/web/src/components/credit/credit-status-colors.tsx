/**
 * The Central Bank's colour grades for a cheque issuer (سامانهٔ صیاد). The
 * thresholds are the official ones: count of bounced cheques or their total.
 */
const STATUSES = [
  {
    name: 'سفید',
    swatch: '#f4f4f5',
    border: '#d4d4d8',
    meaning: 'بدون چک برگشتی، یا همهٔ چک‌های برگشتی رفع سوء اثر شده‌اند.',
  },
  {
    name: 'زرد',
    swatch: '#facc15',
    border: '#eab308',
    meaning: 'یک چک برگشتی، یا جمع مبلغ برگشتی تا ۵ میلیون تومان.',
  },
  {
    name: 'نارنجی',
    swatch: '#fb923c',
    border: '#f97316',
    meaning: '۲ تا ۴ چک برگشتی، یا جمع مبلغ برگشتی تا ۲۰ میلیون تومان.',
  },
  {
    name: 'قهوه‌ای',
    swatch: '#92400e',
    border: '#78350f',
    meaning: '۵ تا ۱۰ چک برگشتی، یا جمع مبلغ برگشتی تا ۵۰ میلیون تومان.',
  },
  {
    name: 'قرمز',
    swatch: '#dc2626',
    border: '#b91c1c',
    meaning: 'بیش از ۱۰ چک برگشتی، یا جمع مبلغ برگشتی بیش از ۵۰ میلیون تومان.',
  },
];

export function CreditStatusColors() {
  return (
    <div className="overflow-hidden rounded-panel border border-line">
      <table className="w-full border-collapse text-start text-[13px]">
        <caption className="sr-only">رنگ‌بندی وضعیت اعتباری صادرکنندهٔ چک در سامانهٔ صیاد</caption>
        <thead className="bg-surface-2 text-[12px] text-muted">
          <tr>
            <th scope="col" className="w-32 px-4 py-3 text-start font-medium">
              وضعیت
            </th>
            <th scope="col" className="px-4 py-3 text-start font-medium">
              یعنی
            </th>
          </tr>
        </thead>
        <tbody>
          {STATUSES.map((status) => (
            <tr key={status.name} className="border-t border-line">
              <th scope="row" className="px-4 py-3 text-start font-medium text-ink">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-3.5 rounded-full border"
                    style={{ backgroundColor: status.swatch, borderColor: status.border }}
                  />
                  {status.name}
                </span>
              </th>
              <td className="px-4 py-3 leading-6 text-ink-muted">{status.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
