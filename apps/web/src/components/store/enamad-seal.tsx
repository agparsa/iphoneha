/**
 * e-Namad trust seal (نماد اعتماد الکترونیکی). enamad.ir validates the seal by
 * the page's origin, so both the link and the image must send
 * `referrerpolicy="origin"` — and the image has to be a plain <img>, loaded
 * from enamad's own server, for the seal to count as verified.
 */
export function EnamadSeal({ id, code }: { id?: string | null; code?: string | null }) {
  if (!id || !code) return null;
  const query = `id=${encodeURIComponent(id)}&Code=${encodeURIComponent(code)}`;
  return (
    <a
      referrerPolicy="origin"
      target="_blank"
      rel="noopener"
      href={`https://trustseal.enamad.ir/?${query}`}
      aria-label="نماد اعتماد الکترونیکی"
      className="block shrink-0 rounded-xl border border-line bg-canvas p-1"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- must be enamad's own image, see above */}
      <img
        referrerPolicy="origin"
        src={`https://trustseal.enamad.ir/logo.aspx?${query}`}
        alt="نماد اعتماد الکترونیکی"
        width={72}
        height={78}
        loading="lazy"
        style={{ cursor: 'pointer' }}
      />
    </a>
  );
}
