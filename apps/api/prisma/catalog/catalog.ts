import type { RegistryStatus } from '@iphoneha/shared';

/**
 * The official iPhone line-up the store carries: names, texts, specs (from
 * Apple's tech-spec pages), every colour and capacity Apple sells, and — in
 * ./images — Apple's product renders for each colour.
 *
 * No prices or stock live here: those are the owner's. A model or a
 * colour × capacity that is added from here starts without a price and stays
 * hidden from the storefront until one is entered in the admin panel.
 */
export interface CatalogProduct {
  slug: string;
  name: string;
  nameEn: string;
  model: string;
  series: string;
  releaseYear: number;
  tagline: string;
  shortDescription: string;
  description: string;
  registryStatus: RegistryStatus;
  isFeatured: boolean;
  sortOrder: number;
  specs: { key: string; value: string }[];
  /** colour codes (see seed-data SEED_COLORS), in Apple's order */
  colors: string[];
  /** capacities in GB */
  capacities: number[];
}

export const CATALOG: CatalogProduct[] = [
  {
    slug: 'iphone-18-pro-max',
    name: 'آیفون ۱۸ پرو مکس',
    nameEn: 'iPhone 18 Pro Max',
    model: 'iPhone 18 Pro Max',
    series: 'iPhone 18',
    releaseYear: 2026,
    tagline: 'دوربینی با دیافراگم متغیر',
    shortDescription: 'نمایشگر ۶٫۹ اینچی، تراشه A20 Pro و دوربین اصلی ۴۸ مگاپیکسلی با دیافراگم متغیر.',
    description:
      'آیفون ۱۸ پرو مکس بزرگ‌ترین آیفون نسل جدید است. نمایشگر ۶٫۹ اینچی Super Retina XDR با ProMotion و Always-On، تراشه A20 Pro و سیستم سه‌دوربینهٔ ۴۸ مگاپیکسلی دارد. دوربین اصلی آن برای اولین بار در آیفون دیافراگم متغیر دارد و بین ƒ/1.48 تا ƒ/4 تغییر می‌کند؛ تله‌فوتوی ۴ برابر هم تا زوم ۸ برابر با کیفیت اپتیکال می‌رسد. بدنهٔ آلومینیومی یکپارچه، Ceramic Shield 2 در جلو و باتری تا ۴۵ ساعت پخش ویدیو، آن را به کامل‌ترین انتخاب این نسل تبدیل کرده است.',
    registryStatus: 'REGISTERED',
    isFeatured: true,
    sortOrder: -2,
    specs: [
      { key: 'نمایشگر', value: '۶٫۹ اینچ Super Retina XDR با ProMotion و Always-On' },
      { key: 'تراشه', value: 'A20 Pro' },
      { key: 'دوربین اصلی', value: 'سه‌دوربینهٔ ۴۸ مگاپیکسل؛ دوربین اصلی با دیافراگم متغیر ƒ/1.48 تا ƒ/4' },
      { key: 'زوم', value: 'تله‌فوتوی ۴ برابر، تا ۸ برابر با کیفیت اپتیکال' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'باتری', value: 'تا ۴۵ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم یکپارچه، Ceramic Shield 2 در جلو' },
      { key: 'وزن', value: '۲۴۹ گرم' },
      { key: 'مقاومت', value: 'IP68 (عمق ۶ متر تا ۳۰ دقیقه)' },
    ],
    colors: ['black', 'silver', 'glacier', 'burgundy'],
    capacities: [256, 512, 1024, 2048],
  },
  {
    slug: 'iphone-18-pro',
    name: 'آیفون ۱۸ پرو',
    nameEn: 'iPhone 18 Pro',
    model: 'iPhone 18 Pro',
    series: 'iPhone 18',
    releaseYear: 2026,
    tagline: 'همهٔ قدرت پرو در ۶٫۳ اینچ',
    shortDescription:
      'تراشه A20 Pro، دوربین دیافراگم متغیر و نمایشگر ۶٫۳ اینچی ProMotion در بدنه‌ای جمع‌وجور.',
    description:
      'آیفون ۱۸ پرو همهٔ امکانات حرفه‌ای نسل جدید را در بدنه‌ای ۶٫۳ اینچی ارائه می‌کند: تراشه A20 Pro، دوربین اصلی ۴۸ مگاپیکسلی با دیافراگم متغیر ƒ/1.48 تا ƒ/4، دوربین فوق‌عریض و تله‌فوتوی ۴ برابر ۴۸ مگاپیکسلی و Dynamic Island کوچک‌تر. بدنهٔ آلومینیومی یکپارچه و باتری تا ۳۶ ساعت پخش ویدیو، آن را به انتخاب کسانی تبدیل می‌کند که قابلیت‌های پرو را در اندازه‌ای راحت‌تر می‌خواهند.',
    registryStatus: 'REGISTERED',
    isFeatured: true,
    sortOrder: -1,
    specs: [
      { key: 'نمایشگر', value: '۶٫۳ اینچ Super Retina XDR با ProMotion و Always-On' },
      { key: 'تراشه', value: 'A20 Pro' },
      { key: 'دوربین اصلی', value: 'سه‌دوربینهٔ ۴۸ مگاپیکسل؛ دوربین اصلی با دیافراگم متغیر ƒ/1.48 تا ƒ/4' },
      { key: 'زوم', value: 'تله‌فوتوی ۴ برابر، تا ۸ برابر با کیفیت اپتیکال' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'باتری', value: 'تا ۳۶ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم یکپارچه، Ceramic Shield 2 در جلو' },
      { key: 'وزن', value: '۲۱۱ گرم' },
      { key: 'مقاومت', value: 'IP68 (عمق ۶ متر تا ۳۰ دقیقه)' },
    ],
    colors: ['black', 'silver', 'glacier', 'burgundy'],
    capacities: [256, 512, 1024, 2048],
  },
  {
    slug: 'iphone-17-pro-max',
    name: 'آیفون ۱۷ پرو مکس',
    nameEn: 'iPhone 17 Pro Max',
    model: 'iPhone 17 Pro Max',
    series: 'iPhone 17',
    releaseYear: 2025,
    tagline: 'فراتر از تصور',
    shortDescription: 'نمایشگر ۶.۹ اینچی، تراشه A19 Pro و بدنه آلومینیومی یکپارچه با سیستم خنک‌کننده بخار.',
    description:
      'آیفون ۱۷ پرو مکس بزرگ‌ترین و قدرتمندترین آیفون نسل جدید است؛ نمایشگر ۶.۹ اینچی Super Retina XDR با ProMotion، تراشه A19 Pro، سه دوربین ۴۸ مگاپیکسلی با زوم اپتیکال تا ۸ برابر و باتری با بیشترین عمر در میان آیفون‌ها. بدنه آلومینیومی یکپارچه به همراه محفظه بخار، عملکرد پایدار را در بازی و ضبط ویدیوی طولانی تضمین می‌کند.',
    registryStatus: 'REGISTERED',
    isFeatured: true,
    sortOrder: 1,
    specs: [
      { key: 'نمایشگر', value: '۶٫۹ اینچ Super Retina XDR با ProMotion و Always-On' },
      { key: 'تراشه', value: 'A19 Pro' },
      { key: 'دوربین اصلی', value: 'سه‌دوربینهٔ ۴۸ مگاپیکسل Fusion' },
      { key: 'زوم', value: 'تله‌فوتوی ۴ برابر، تا ۸ برابر با کیفیت اپتیکال' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'باتری', value: 'تا ۳۹ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم یکپارچه با محفظهٔ بخار، Ceramic Shield 2 در جلو' },
      { key: 'وزن', value: '۲۳۳ گرم' },
      { key: 'مقاومت', value: 'IP68 (عمق ۶ متر تا ۳۰ دقیقه)' },
    ],
    colors: ['silver', 'cosmic-orange', 'deep-blue'],
    capacities: [256, 512, 1024, 2048],
  },
  {
    slug: 'iphone-17-pro',
    name: 'آیفون ۱۷ پرو',
    nameEn: 'iPhone 17 Pro',
    model: 'iPhone 17 Pro',
    series: 'iPhone 17',
    releaseYear: 2025,
    tagline: 'قدرت حرفه‌ای',
    shortDescription: 'همان قدرت پرو در ابعاد ۶.۳ اینچی و وزن کمتر.',
    description:
      'آیفون ۱۷ پرو تمام امکانات حرفه‌ای نسل جدید را در بدنه‌ای جمع‌وجورتر ارائه می‌دهد: تراشه A19 Pro، سه دوربین ۴۸ مگاپیکسلی، نمایشگر ۶.۳ اینچی ProMotion و شارژ سریع‌تر. انتخابی ایده‌آل برای کسانی که قابلیت‌های پرو را می‌خواهند اما گوشی بزرگ دوست ندارند.',
    registryStatus: 'REGISTERED',
    isFeatured: true,
    sortOrder: 2,
    specs: [
      { key: 'نمایشگر', value: '۶٫۳ اینچ Super Retina XDR با ProMotion و Always-On' },
      { key: 'تراشه', value: 'A19 Pro' },
      { key: 'دوربین اصلی', value: 'سه‌دوربینهٔ ۴۸ مگاپیکسل Fusion' },
      { key: 'زوم', value: 'تله‌فوتوی ۴ برابر، تا ۸ برابر با کیفیت اپتیکال' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'باتری', value: 'تا ۳۳ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم یکپارچه با محفظهٔ بخار، Ceramic Shield 2 در جلو' },
      { key: 'وزن', value: '۲۰۶ گرم' },
      { key: 'مقاومت', value: 'IP68 (عمق ۶ متر تا ۳۰ دقیقه)' },
    ],
    colors: ['silver', 'cosmic-orange', 'deep-blue'],
    capacities: [256, 512, 1024],
  },
  {
    slug: 'iphone-air',
    name: 'آیفون ایر',
    nameEn: 'iPhone Air',
    model: 'iPhone Air',
    series: 'iPhone 17',
    releaseYear: 2025,
    tagline: 'نازک‌ترین آیفون تاریخ',
    shortDescription: 'بدنه تیتانیومی ۵.۶ میلی‌متری با نمایشگر ۶.۵ اینچی ProMotion.',
    description:
      'آیفون ایر سبک‌ترین و نازک‌ترین آیفونی است که اپل ساخته است؛ تنها ۵.۶ میلی‌متر ضخامت با بدنه تیتانیومی مقاوم، نمایشگر ۶.۵ اینچی ProMotion و تراشه A19 Pro. دوربین ۴۸ مگاپیکسلی Fusion و دوربین سلفی Center Stage تجربه‌ای کامل در بدنه‌ای فوق‌العاده سبک ارائه می‌دهند.',
    registryStatus: 'REGISTERED',
    isFeatured: true,
    sortOrder: 3,
    specs: [
      { key: 'نمایشگر', value: '۶٫۵ اینچ Super Retina XDR با ProMotion و Always-On' },
      { key: 'تراشه', value: 'A19 Pro' },
      { key: 'دوربین اصلی', value: '۴۸ مگاپیکسل Fusion' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'باتری', value: 'تا ۲۷ ساعت پخش ویدیو' },
      { key: 'ضخامت', value: '۵٫۶ میلی‌متر' },
      { key: 'بدنه', value: 'تیتانیوم' },
      { key: 'وزن', value: '۱۶۵ گرم' },
      { key: 'مقاومت', value: 'IP68 (عمق ۶ متر تا ۳۰ دقیقه)' },
    ],
    colors: ['space-black', 'cloud-white', 'light-gold', 'sky-blue'],
    capacities: [256, 512, 1024],
  },
  {
    slug: 'iphone-17',
    name: 'آیفون ۱۷',
    nameEn: 'iPhone 17',
    model: 'iPhone 17',
    series: 'iPhone 17',
    releaseYear: 2025,
    tagline: 'روشن‌تر از همیشه',
    shortDescription: 'نمایشگر ۶.۳ اینچی ۱۲۰ هرتز، تراشه A19 و دوربین دوگانه ۴۸ مگاپیکسلی.',
    description:
      'آیفون ۱۷ نسخه استاندارد نسل جدید است که برای اولین بار نمایشگر ProMotion ۱۲۰ هرتز و حافظه پایه ۲۵۶ گیگابایتی دارد. تراشه A19، دوربین دوگانه ۴۸ مگاپیکسلی و دوربین سلفی ۱۸ مگاپیکسلی، آن را به انتخابی متعادل برای بیشتر کاربران تبدیل می‌کند.',
    registryStatus: 'REGISTERED',
    isFeatured: true,
    sortOrder: 4,
    specs: [
      { key: 'نمایشگر', value: '۶٫۳ اینچ Super Retina XDR با ProMotion و Always-On' },
      { key: 'تراشه', value: 'A19' },
      { key: 'دوربین اصلی', value: 'دوگانهٔ ۴۸ مگاپیکسل Fusion (اصلی و فوق‌عریض)' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'باتری', value: 'تا ۳۰ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم، Ceramic Shield 2 در جلو' },
      { key: 'وزن', value: '۱۷۷ گرم' },
      { key: 'مقاومت', value: 'IP68 (عمق ۶ متر تا ۳۰ دقیقه)' },
    ],
    colors: ['black', 'white', 'mist-blue', 'sage', 'lavender'],
    capacities: [256, 512],
  },
  {
    slug: 'iphone-16-pro-max',
    name: 'آیفون ۱۶ پرو مکس',
    nameEn: 'iPhone 16 Pro Max',
    model: 'iPhone 16 Pro Max',
    series: 'iPhone 16',
    releaseYear: 2024,
    tagline: 'انتخاب مطمئن',
    shortDescription: 'پرچم‌دار نسل قبل با بدنه تیتانیومی و قیمتی منطقی‌تر.',
    description:
      'آیفون ۱۶ پرو مکس همچنان یکی از بهترین انتخاب‌های بازار است: نمایشگر ۶.۹ اینچی، تراشه A18 Pro، سه دوربین ۴۸ مگاپیکسلی با زوم ۵ برابر و بدنه تیتانیومی. اگر به دنبال تجربه پرچم‌دار با قیمت منطقی‌تر هستید، این مدل گزینه مناسبی است.',
    registryStatus: 'REGISTERED',
    isFeatured: false,
    sortOrder: 5,
    specs: [
      { key: 'نمایشگر', value: '۶٫۹ اینچ Super Retina XDR با ProMotion و Always-On' },
      { key: 'تراشه', value: 'A18 Pro' },
      { key: 'دوربین اصلی', value: '۴۸ مگاپیکسل Fusion، فوق‌عریض ۴۸ مگاپیکسل و تله‌فوتوی ۱۲ مگاپیکسل' },
      { key: 'زوم', value: 'تله‌فوتوی ۵ برابر اپتیکال' },
      { key: 'دوربین سلفی', value: '۱۲ مگاپیکسل TrueDepth' },
      { key: 'باتری', value: 'تا ۳۳ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'تیتانیوم درجه ۵' },
      { key: 'وزن', value: '۲۲۷ گرم' },
      { key: 'مقاومت', value: 'IP68 (عمق ۶ متر تا ۳۰ دقیقه)' },
    ],
    colors: ['black-titanium', 'white-titanium', 'natural-titanium', 'desert-titanium'],
    capacities: [256, 512, 1024],
  },
  {
    slug: 'iphone-16-pro',
    name: 'آیفون ۱۶ پرو',
    nameEn: 'iPhone 16 Pro',
    model: 'iPhone 16 Pro',
    series: 'iPhone 16',
    releaseYear: 2024,
    tagline: 'پرو در اندازهٔ جمع‌وجور',
    shortDescription: 'بدنهٔ تیتانیومی، نمایشگر ۶٫۳ اینچی ProMotion و تله‌فوتوی ۵ برابر.',
    description:
      'آیفون ۱۶ پرو قابلیت‌های حرفه‌ای نسل ۱۶ را در بدنه‌ای ۶٫۳ اینچی و سبک‌تر ارائه می‌کند: تراشهٔ A18 Pro، دوربین ۴۸ مگاپیکسلی Fusion، دوربین فوق‌عریض ۴۸ مگاپیکسلی، تله‌فوتوی ۵ برابر و دکمهٔ Camera Control. بدنهٔ تیتانیومی درجه ۵ و نمایشگر ProMotion با Always-On آن را به انتخابی حرفه‌ای با قیمتی منطقی‌تر از نسل جدید تبدیل می‌کند.',
    registryStatus: 'REGISTERED',
    isFeatured: false,
    sortOrder: 5,
    specs: [
      { key: 'نمایشگر', value: '۶٫۳ اینچ Super Retina XDR با ProMotion و Always-On' },
      { key: 'تراشه', value: 'A18 Pro' },
      { key: 'دوربین اصلی', value: '۴۸ مگاپیکسل Fusion، فوق‌عریض ۴۸ مگاپیکسل و تله‌فوتوی ۱۲ مگاپیکسل' },
      { key: 'زوم', value: 'تله‌فوتوی ۵ برابر اپتیکال' },
      { key: 'دوربین سلفی', value: '۱۲ مگاپیکسل TrueDepth' },
      { key: 'باتری', value: 'تا ۲۷ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'تیتانیوم درجه ۵' },
      { key: 'وزن', value: '۱۹۹ گرم' },
      { key: 'مقاومت', value: 'IP68 (عمق ۶ متر تا ۳۰ دقیقه)' },
    ],
    colors: ['black-titanium', 'white-titanium', 'natural-titanium', 'desert-titanium'],
    capacities: [128, 256, 512, 1024],
  },
  {
    slug: 'iphone-16',
    name: 'آیفون ۱۶',
    nameEn: 'iPhone 16',
    model: 'iPhone 16',
    series: 'iPhone 16',
    releaseYear: 2024,
    tagline: 'شروع هوشمند',
    shortDescription: 'دکمه کنترل دوربین و تراشه A18 با قیمت ورودی.',
    description:
      'آیفون ۱۶ با تراشه A18، دوربین دوگانه ۴۸ مگاپیکسلی و دکمه اختصاصی کنترل دوربین، گزینه‌ای مقرون‌به‌صرفه برای ورود به دنیای آیفون است. رنگ‌های متنوع و باتری مناسب، آن را به انتخابی محبوب تبدیل کرده است.',
    registryStatus: 'ACTIVATION_CODE',
    isFeatured: false,
    sortOrder: 6,
    specs: [
      { key: 'نمایشگر', value: '۶٫۱ اینچ Super Retina XDR' },
      { key: 'تراشه', value: 'A18' },
      { key: 'دوربین اصلی', value: '۴۸ مگاپیکسل Fusion و فوق‌عریض ۱۲ مگاپیکسل' },
      { key: 'دوربین سلفی', value: '۱۲ مگاپیکسل TrueDepth' },
      { key: 'باتری', value: 'تا ۲۲ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم' },
      { key: 'وزن', value: '۱۷۰ گرم' },
      { key: 'مقاومت', value: 'IP68 (عمق ۶ متر تا ۳۰ دقیقه)' },
    ],
    colors: ['black', 'white', 'pink', 'teal', 'ultramarine'],
    capacities: [128, 256, 512],
  },
];
