/**
 * Draws the magazine covers and the instalment pages' share images into
 * apps/web/public/covers/ with the same Chromium the tests use:
 *
 *   pnpm --filter @iphoneha/e2e covers
 *
 * Persian text is laid out by the browser with the site's own Estedad font,
 * and the phones are the official catalogue photos that ship with the repo.
 * Article covers are 1600×840 (they are also the article's hero image), the
 * landing pages' share images 1200×630 — the same 1.9:1 frame.
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'apps/web/public/covers');
const asset = (relative) => pathToFileURL(path.join(root, relative)).href;
/** Images go in as data URLs: a page opened with setContent may not load file:// images. */
async function inline(relative, type) {
  return `data:${type};base64,${(await readFile(path.join(root, relative))).toString('base64')}`;
}
const phone = (file) => inline(`apps/api/prisma/catalog/images/${file}`, 'image/webp');
const fonts = {
  arabic: asset('apps/web/src/assets/fonts/estedad-arabic.woff2'),
  latin: asset('apps/web/src/assets/fonts/estedad-latin.woff2'),
};
const mark = await inline('apps/web/public/brand/mark.svg', 'image/svg+xml');

const COVERS = [
  {
    file: 'buy-iphone-with-sayad-cheque',
    kind: 'article',
    title: 'خرید آیفون با چک صیادی',
    sub: 'شرایط، مدارک و مراحل خرید گوشی با چک',
    visual: 'cheque',
    phone: 'iphone-17-pro-max/cosmic-orange-1.webp',
  },
  {
    file: 'buy-iphone-with-safte',
    kind: 'article',
    title: 'خرید آیفون با سفته',
    sub: 'با ضامن یا بدون ضامن؟ قدم‌به‌قدم',
    visual: 'safte',
    phone: 'iphone-17-pro-max/deep-blue-1.webp',
  },
  {
    file: 'installment-phone-buying-guide',
    kind: 'article',
    title: 'خرید گوشی قسطی',
    sub: 'چک، سفته یا اعتبار آنلاین؛ کدام بهتر است؟',
    visual: 'compare',
    phone: 'iphone-air/sky-blue-1.webp',
  },
  {
    file: 'iphone-installment-calculation',
    kind: 'article',
    title: 'محاسبه اقساط آیفون',
    sub: 'پیش‌پرداخت، کارمزد و قسط ماهانه',
    visual: 'calc',
    phone: 'iphone-17/lavender-1.webp',
  },
  {
    file: 'sayad-cheque-credit-status',
    kind: 'article',
    title: 'استعلام چک صیادی',
    sub: 'رنگ‌بندی اعتبار، پیش از خرید قسطی',
    visual: 'status',
    phone: null,
  },
  {
    file: 'installment-phone-without-guarantor',
    kind: 'article',
    title: 'خرید گوشی قسطی بدون ضامن',
    sub: 'با چک، سفته یا اعتبار آنلاین؛ شرایط واقعی',
    visual: 'noGuarantor',
    phone: 'iphone-17-pro/deep-blue-1.webp',
  },
  {
    file: 'remote-installment-phone-purchase',
    kind: 'article',
    title: 'خرید گوشی قسطی غیرحضوری',
    sub: 'از هر شهر ایران؛ مدارک، قرارداد و ارسال',
    visual: 'remote',
    phone: 'iphone-16-pro-max/desert-titanium-1.webp',
  },
  {
    file: 'electronic-safte-guide',
    kind: 'article',
    title: 'سفته الکترونیک',
    sub: 'صدور آنلاین، امضای دیجیتال و خرید قسطی',
    visual: 'eSafte',
    phone: null,
  },
  {
    file: 'installment-contract-checklist',
    kind: 'article',
    title: 'قرارداد خرید اقساطی',
    sub: '۱۲ نکته که پیش از امضا باید چک کنی',
    visual: 'contract',
    phone: null,
  },
  {
    file: 'installment-phone-with-national-card',
    kind: 'article',
    title: 'خرید گوشی قسطی با کارت ملی',
    sub: 'کارت ملی به‌تنهایی کافی است؟',
    visual: 'idCard',
    phone: 'iphone-17/sage-1.webp',
  },
  {
    file: 'installments',
    kind: 'og',
    kicker: 'آیفون قسطی',
    title: 'خرید آیفون قسطی',
    sub: 'با چک صیادی یا سفته، ارسال به سراسر ایران',
    visual: 'hub',
    phone: 'iphone-17-pro-max/cosmic-orange-1.webp',
  },
  {
    file: 'installments-cheque',
    kind: 'og',
    kicker: 'اقساط با چک صیادی',
    title: 'خرید گوشی با چک',
    sub: 'استعلام، قرارداد و ثبت چک غیرحضوری',
    visual: 'cheque',
    phone: 'iphone-17-pro-max/deep-blue-1.webp',
  },
  {
    file: 'installments-safte',
    kind: 'og',
    kicker: 'اقساط بدون چک',
    title: 'خرید آیفون با سفته',
    sub: 'سفتهٔ کاغذی یا الکترونیک، سراسر ایران',
    visual: 'safte',
    phone: 'iphone-air/light-gold-1.webp',
  },
];

// ─── the pictures on the left ────────────────────────────────────────────────

const signature =
  '<svg viewBox="0 0 160 50" class="sig"><path d="M4 38c14-22 24-30 30-24s-8 26 2 24 16-30 26-26-6 22 4 22 14-18 22-16 2 14 10 14 18-10 30-8" fill="none" stroke="#3b1f7a" stroke-width="3.2" stroke-linecap="round"/></svg>';

const VISUALS = {
  cheque: () => `
    <div class="cheque">
      <div class="cheque-top"><span>چک صیادی</span><span class="bank">بانک</span></div>
      <div class="sayad">${'<i></i>'.repeat(16)}</div>
      <div class="line"><b>به حواله‌کرد</b><span>آیفونی‌ها</span></div>
      <div class="line"><b>مبلغ</b><span class="dots"></span></div>
      <div class="line"><b>تاریخ</b><span class="dots short"></span>${signature}</div>
    </div>`,
  safte: () => `
    <div class="safte">
      <div class="safte-head"><span>سفته</span><em>تضمین پرداخت اقساط</em></div>
      <div class="safte-body">
        <div class="line"><b>مبلغ</b><span class="dots"></span></div>
        <div class="line"><b>در وجه</b><span>آیفونی‌ها</span></div>
        <div class="line"><b>سررسید</b><span class="dots short"></span></div>
      </div>
      <div class="stamp">امضا</div>
      ${signature}
    </div>`,
  compare: () => `
    <div class="chips">
      <span style="--c:#0e8a5c">چک صیادی</span>
      <span style="--c:#7c3aed">سفته</span>
      <span style="--c:#0284c7">اعتبار آنلاین</span>
    </div>`,
  calc: () => `
    <div class="calc">
      <div class="row"><span>قیمت نقد</span><b>۱۰۰٪</b></div>
      <div class="row"><span>پیش‌پرداخت</span><b>−</b></div>
      <div class="row"><span>کارمزد ماهانه</span><b>+</b></div>
      <div class="sum"><span>قسط ماهانه</span><b>÷ ماه‌ها</b></div>
    </div>`,
  status: () => `
    <div class="status">
      ${[
        ['سفید', '#f4f4f5'],
        ['زرد', '#facc15'],
        ['نارنجی', '#fb923c'],
        ['قهوه‌ای', '#92400e'],
        ['قرمز', '#dc2626'],
      ]
        .map(([name, color]) => `<div><i style="background:${color}"></i><span>${name}</span></div>`)
        .join('')}
    </div>`,
  hub: () => `
    <div class="chips">
      <span style="--c:#0e8a5c">چک صیادی</span>
      <span style="--c:#7c3aed">سفته</span>
    </div>`,
  noGuarantor: () => `
    <div class="checklist">
      <div class="no"><i>✕</i><span>ضامن</span></div>
      <div><i>✓</i><span>چک صیادی یا سفته</span></div>
      <div><i>✓</i><span>وضعیت اعتباری سفید</span></div>
    </div>`,
  remote: () => `
    <div class="route">
      ${['درخواست آنلاین', 'قرارداد از راه دور', 'ارسال به شهر تو']
        .map((step, index) => `<div><b>${'۱۲۳'[index]}</b><span>${step}</span></div>`)
        .join('')}
    </div>`,
  eSafte: () => `
    <div class="esafte">
      <div class="esafte-head"><span>سفتهٔ الکترونیک</span><em>شناسهٔ سفته</em></div>
      <div class="code">${'<i></i>'.repeat(16)}</div>
      <div class="line"><b>مبلغ</b><span class="dots"></span></div>
      <div class="line"><b>در وجه</b><span>آیفونی‌ها</span></div>
      <div class="badge">✓ امضای دیجیتال</div>
    </div>`,
  contract: () => `
    <div class="contract">
      <div class="contract-head">قرارداد خرید اقساطی</div>
      ${'<p></p>'.repeat(3)}
      ${['جدول اقساط', 'جمع کل پرداختی', 'چک و سفته', 'شرایط دیرکرد']
        .map((item) => `<div class="tick"><i>✓</i><span>${item}</span></div>`)
        .join('')}
      ${signature}
    </div>`,
  idCard: () => `
    <div class="idcard">
      <div class="idcard-head">کارت ملی</div>
      <div class="idcard-body">
        <div class="photo"><i></i></div>
        <div class="fields"><p></p><p></p><p class="short"></p><div class="digits">${'<i></i>'.repeat(10)}</div></div>
      </div>
    </div>
    <div class="plus">+ چک یا سفته</div>`,
};

async function html(cover) {
  const phoneImage = cover.phone ? `<img class="phone" src="${await phone(cover.phone)}" alt="" />` : '';
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  @font-face { font-family: Estedad; src: url(${fonts.arabic}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: Estedad; src: url(${fonts.latin}) format('woff2'); font-weight: 100 900; unicode-range: U+0000-00FF; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1600px; height: 840px; overflow: hidden; }
  body { position: relative; font-family: Estedad, sans-serif; background: #0c2b21; color: #fff; }
  .grid { position: absolute; inset: 0; background-image: linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.05) 1px, transparent 1px); background-size: 56px 56px; mask-image: radial-gradient(ellipse at 30% 50%, #000 20%, transparent 75%); }
  .glow { position: absolute; border-radius: 50%; filter: blur(90px); }
  .g1 { width: 900px; height: 900px; top: -420px; right: -260px; background: rgb(14 138 92 / 0.55); }
  .g2 { width: 700px; height: 700px; bottom: -380px; left: 120px; background: rgb(191 227 210 / 0.16); }
  .text { position: absolute; right: 96px; top: 0; bottom: 0; width: 840px; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 700; }
  .brand img { width: 58px; height: 58px; }
  .kicker { margin-inline-start: 10px; padding: 6px 18px; border-radius: 999px; background: rgb(255 255 255 / 0.1); color: #bfe3d2; font-size: 22px; font-weight: 500; }
  h1 { margin-top: 44px; font-size: 80px; line-height: 1.3; font-weight: 800; letter-spacing: -0.5px; }
  .sub { margin-top: 22px; font-size: 34px; line-height: 1.6; color: #bfe3d2; font-weight: 500; }
  .url { position: absolute; right: 96px; bottom: 58px; font-size: 26px; color: rgb(255 255 255 / 0.6); direction: ltr; font-weight: 600; letter-spacing: 0.5px; }
  .art { position: absolute; left: 70px; top: 0; bottom: 0; width: 640px; }
  .phone { position: absolute; left: 60px; top: 50%; height: 700px; transform: translateY(-50%) rotate(-6deg); filter: drop-shadow(0 40px 50px rgb(0 0 0 / 0.45)); }
  /* cheque */
  .cheque { position: absolute; left: 150px; bottom: 90px; width: 520px; padding: 26px 30px; border-radius: 22px; background: linear-gradient(135deg, #f3effe, #ddd3fb); color: #2e1065; box-shadow: 0 30px 60px -20px rgb(0 0 0 / 0.55); transform: rotate(5deg); }
  .cheque-top { display: flex; justify-content: space-between; font-weight: 800; font-size: 28px; }
  .cheque-top .bank { font-weight: 500; font-size: 20px; opacity: 0.6; }
  .sayad { display: flex; gap: 5px; margin: 16px 0 12px; direction: ltr; }
  .sayad i { width: 22px; height: 28px; border-radius: 5px; background: rgb(76 29 149 / 0.14); }
  .line { display: flex; align-items: center; gap: 12px; margin-top: 12px; font-size: 20px; }
  .line b { font-weight: 600; color: rgb(46 16 101 / 0.65); }
  .line span { font-weight: 700; }
  .dots { flex: 1; border-bottom: 2px dashed rgb(46 16 101 / 0.3); height: 12px; }
  .dots.short { flex: 0 0 140px; }
  .sig { width: 150px; height: 46px; margin-inline-start: auto; }
  /* safte */
  .safte { position: absolute; left: 150px; bottom: 80px; width: 500px; padding: 24px 28px 30px; border-radius: 10px; background: #fdf8ea; color: #3f2a09; box-shadow: 0 30px 60px -20px rgb(0 0 0 / 0.55); transform: rotate(-5deg); border: 10px solid transparent; background-image: linear-gradient(#fdf8ea, #fdf8ea), repeating-linear-gradient(45deg, #c9a24a 0 6px, #e8d39a 6px 12px); background-origin: border-box; background-clip: padding-box, border-box; }
  .safte-head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid rgb(63 42 9 / 0.2); padding-bottom: 12px; }
  .safte-head span { font-size: 40px; font-weight: 900; }
  .safte-head em { font-style: normal; font-size: 18px; opacity: 0.6; }
  .safte .line b { color: rgb(63 42 9 / 0.6); }
  .safte .dots { border-color: rgb(63 42 9 / 0.3); }
  .stamp { position: absolute; left: 28px; top: 88px; width: 96px; height: 96px; border-radius: 50%; border: 4px solid rgb(185 28 28 / 0.55); color: rgb(185 28 28 / 0.65); display: grid; place-items: center; font-weight: 800; font-size: 20px; transform: rotate(-14deg); }
  .safte .sig { position: absolute; left: 34px; bottom: 16px; }
  .safte .sig path { stroke: #3f2a09; }
  /* chips */
  .chips { position: absolute; left: 330px; top: 50%; transform: translateY(-50%); display: grid; gap: 18px; }
  .chips span { display: inline-flex; align-items: center; gap: 12px; padding: 14px 26px 14px 22px; border-radius: 999px; background: #fff; color: #0c2b21; font-size: 28px; font-weight: 700; box-shadow: 0 20px 40px -18px rgb(0 0 0 / 0.5); }
  .chips span::before { content: ''; width: 18px; height: 18px; border-radius: 50%; background: var(--c); }
  .chips span:nth-child(2) { margin-inline-start: 40px; }
  .chips span:nth-child(3) { margin-inline-start: 10px; }
  /* calculator */
  .calc { position: absolute; left: 250px; top: 50%; transform: translateY(-50%) rotate(4deg); width: 380px; padding: 26px; border-radius: 26px; background: #fff; color: #0c2b21; box-shadow: 0 30px 60px -20px rgb(0 0 0 / 0.55); }
  .calc .row { display: flex; justify-content: space-between; padding: 12px 4px; border-bottom: 1px solid #e7ece9; font-size: 24px; }
  .calc .row span { color: #56635d; }
  .calc .row b { font-weight: 800; }
  .calc .sum { display: flex; justify-content: space-between; margin-top: 16px; padding: 16px 18px; border-radius: 16px; background: #0e8a5c; color: #fff; font-size: 26px; font-weight: 800; }
  /* credit status */
  .status { position: absolute; left: 90px; top: 50%; transform: translateY(-50%); display: grid; gap: 16px; }
  .status div { display: flex; align-items: center; gap: 18px; width: 420px; padding: 16px 24px; border-radius: 20px; background: rgb(255 255 255 / 0.07); border: 1px solid rgb(255 255 255 / 0.12); font-size: 30px; font-weight: 700; }
  .status i { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgb(255 255 255 / 0.5); }
  .status div:nth-child(even) { margin-inline-start: 50px; }
  /* without a guarantor */
  .checklist { position: absolute; left: 250px; top: 50%; transform: translateY(-50%) rotate(-3deg); display: grid; gap: 16px; }
  .checklist div { display: flex; align-items: center; gap: 16px; width: 400px; padding: 16px 24px; border-radius: 20px; background: #fff; color: #0c2b21; font-size: 28px; font-weight: 700; box-shadow: 0 24px 44px -20px rgb(0 0 0 / 0.55); }
  .checklist i { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #0e8a5c; color: #fff; font-style: normal; font-size: 24px; }
  .checklist .no { color: #9aa5a0; }
  .checklist .no span { text-decoration: line-through; text-decoration-thickness: 3px; }
  .checklist .no i { background: #dc2626; }
  .checklist div:nth-child(2) { margin-inline-start: 36px; }
  /* remote purchase */
  .route { position: absolute; left: 250px; top: 50%; transform: translateY(-50%); display: grid; gap: 22px; }
  .route div { position: relative; display: flex; align-items: center; gap: 18px; width: 400px; padding: 14px 22px; border-radius: 999px; background: #fff; color: #0c2b21; font-size: 28px; font-weight: 700; box-shadow: 0 24px 44px -20px rgb(0 0 0 / 0.55); }
  .route b { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; background: #0e8a5c; color: #fff; font-size: 26px; }
  .route div:nth-child(2) { margin-inline-start: 36px; }
  .route div:not(:last-child)::after { content: ''; position: absolute; right: 44px; top: 100%; height: 22px; border-right: 3px dashed rgb(191 227 210 / 0.8); }
  /* electronic promissory note */
  .esafte { position: absolute; left: 110px; top: 50%; width: 520px; padding: 26px 30px 30px; border-radius: 28px; background: #fff; color: #0c2b21; box-shadow: 0 30px 60px -20px rgb(0 0 0 / 0.55); transform: translateY(-50%) rotate(-4deg); }
  .esafte-head { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 14px; border-bottom: 2px solid #e7ece9; }
  .esafte-head span { font-size: 36px; font-weight: 900; }
  .esafte-head em { font-style: normal; font-size: 18px; color: #56635d; }
  .esafte .code { display: flex; gap: 5px; margin: 18px 0 8px; direction: ltr; }
  .esafte .code i { width: 22px; height: 28px; border-radius: 5px; background: rgb(14 138 92 / 0.16); }
  .esafte .line b { color: #56635d; }
  .esafte .dots { border-color: rgb(12 43 33 / 0.25); }
  .badge { display: inline-block; margin-top: 22px; padding: 10px 22px; border-radius: 999px; background: #0e8a5c; color: #fff; font-size: 24px; font-weight: 800; }
  /* contract */
  .contract { position: absolute; left: 150px; top: 50%; width: 460px; padding: 30px 34px 26px; border-radius: 14px; background: #fbfaf7; color: #0c2b21; box-shadow: 0 30px 60px -20px rgb(0 0 0 / 0.55); transform: translateY(-50%) rotate(4deg); }
  .contract-head { font-size: 32px; font-weight: 900; text-align: center; padding-bottom: 14px; border-bottom: 2px solid #e2ddd2; }
  .contract p { height: 10px; margin-top: 14px; border-radius: 6px; background: #e7e2d6; }
  .contract p:nth-of-type(3) { width: 60%; }
  .tick { display: flex; align-items: center; gap: 14px; margin-top: 16px; font-size: 24px; font-weight: 700; }
  .tick i { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; background: #0e8a5c; color: #fff; font-style: normal; font-size: 20px; }
  .contract .sig { display: block; margin-top: 10px; margin-inline-start: auto; }
  /* national card */
  .idcard { position: absolute; left: 110px; top: 50%; width: 430px; border-radius: 26px; overflow: hidden; background: #fff; color: #0c2b21; box-shadow: 0 30px 60px -20px rgb(0 0 0 / 0.55); transform: translateY(-58%) rotate(-5deg); }
  .idcard-head { padding: 14px 26px; background: #0e8a5c; color: #fff; font-size: 28px; font-weight: 800; }
  .idcard-body { display: flex; gap: 22px; padding: 24px 26px 28px; }
  .photo { flex: 0 0 112px; height: 140px; border-radius: 14px; background: #e7ece9; display: grid; place-items: end center; overflow: hidden; }
  .photo i { width: 80px; height: 96px; border-radius: 40px 40px 12px 12px; background: #b8c4be; }
  .fields { flex: 1; }
  .fields p { height: 12px; margin-top: 12px; border-radius: 6px; background: #e7ece9; }
  .fields p.short { width: 55%; }
  .digits { display: flex; gap: 5px; margin-top: 20px; direction: ltr; }
  .digits i { width: 20px; height: 26px; border-radius: 5px; background: rgb(14 138 92 / 0.16); }
  .plus { position: absolute; left: 190px; top: 72%; padding: 14px 28px; border-radius: 999px; background: #bfe3d2; color: #0c2b21; font-size: 28px; font-weight: 800; box-shadow: 0 20px 40px -18px rgb(0 0 0 / 0.5); }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="glow g1"></div>
  <div class="glow g2"></div>
  <div class="art">${phoneImage}${VISUALS[cover.visual]()}</div>
  <div class="text">
    <div class="brand"><img src="${mark}" alt="" />آیفونی‌ها<span class="kicker">${cover.kicker ?? 'مجلهٔ آیفونی‌ها'}</span></div>
    <h1>${cover.title}</h1>
    <p class="sub">${cover.sub}</p>
  </div>
  <div class="url">iphoneha.com</div>
</body>
</html>`;
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
);
for (const cover of COVERS) {
  // the share images are the same 1.9:1 layout drawn at 3/4 size
  const scale = cover.kind === 'og' ? 0.75 : 1;
  const page = await browser.newPage({ viewport: { width: 1600, height: 840 }, deviceScaleFactor: scale });
  await page.setContent(await html(cover), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(out, `${cover.file}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 84 });
  await page.close();
  console.log(`✓ ${path.relative(root, file)}`);
}
await browser.close();
