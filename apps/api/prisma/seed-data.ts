import type { ShippingTime } from '@iphoneha/shared';

export interface SeedColor {
  code: string;
  name: string;
  nameEn: string;
  hex: string;
  aliases: string[];
  /** Gradient stops used both for the CSS finish and the generated mockup image */
  stops: { offset: number; color: string }[];
  wall: { offset: number; color: string }[];
}

const DARK_WALL = [
  { offset: 0, color: '#3b4149' },
  { offset: 62, color: '#0c0e11' },
];
const WARM_WALL = [
  { offset: 0, color: '#4a3c2c' },
  { offset: 62, color: '#0d0b09' },
];
const BLUE_WALL = [
  { offset: 0, color: '#2f3b4d' },
  { offset: 62, color: '#080a0e' },
];

export const SEED_COLORS: SeedColor[] = [
  {
    code: 'cosmic-orange',
    name: 'نارنجی کیهانی',
    nameEn: 'Cosmic Orange',
    hex: '#c8864c',
    aliases: ['orange', 'نارنجی', 'کیهانی'],
    stops: [
      { offset: 0, color: '#f7e9d9' },
      { offset: 30, color: '#d9a877' },
      { offset: 52, color: '#f2e0cb' },
      { offset: 78, color: '#bf8b57' },
      { offset: 100, color: '#ecd9c2' },
    ],
    wall: WARM_WALL,
  },
  {
    code: 'deep-blue',
    name: 'آبی عمیق',
    nameEn: 'Deep Blue',
    hex: '#4a6a97',
    aliases: ['blue', 'آبی', 'سرمه‌ای'],
    stops: [
      { offset: 0, color: '#dfe7f3' },
      { offset: 30, color: '#7e9ac1' },
      { offset: 52, color: '#d5e0ef' },
      { offset: 78, color: '#5c789f' },
      { offset: 100, color: '#c6d3e6' },
    ],
    wall: BLUE_WALL,
  },
  {
    code: 'silver',
    name: 'نقره‌ای',
    nameEn: 'Silver',
    hex: '#dfe2e7',
    aliases: ['silver', 'نقره', 'سیلور'],
    stops: [
      { offset: 0, color: '#fdfdfe' },
      { offset: 28, color: '#d7dae0' },
      { offset: 48, color: '#f4f5f7' },
      { offset: 72, color: '#c2c6cd' },
      { offset: 100, color: '#edeff2' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'space-black',
    name: 'مشکی فضایی',
    nameEn: 'Space Black',
    hex: '#3a3d42',
    aliases: ['black', 'مشکی', 'سیاه', 'فضایی'],
    stops: [
      { offset: 0, color: '#93969c' },
      { offset: 30, color: '#4d5257' },
      { offset: 52, color: '#82868d' },
      { offset: 78, color: '#3a3e44' },
      { offset: 100, color: '#6e7279' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'cloud-white',
    name: 'سفید ابری',
    nameEn: 'Cloud White',
    hex: '#eef0f3',
    aliases: ['white', 'سفید', 'ابری'],
    stops: [
      { offset: 0, color: '#ffffff' },
      { offset: 28, color: '#e6e8ec' },
      { offset: 48, color: '#fafbfc' },
      { offset: 72, color: '#d3d7dd' },
      { offset: 100, color: '#f4f5f7' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'light-gold',
    name: 'طلایی روشن',
    nameEn: 'Light Gold',
    hex: '#e6d3ae',
    aliases: ['gold', 'طلایی', 'طلا'],
    stops: [
      { offset: 0, color: '#fbf3e3' },
      { offset: 30, color: '#e2cda3' },
      { offset: 52, color: '#f6ecd9' },
      { offset: 78, color: '#cbb281' },
      { offset: 100, color: '#f0e3cb' },
    ],
    wall: WARM_WALL,
  },
  {
    code: 'sky-blue',
    name: 'آبی آسمانی',
    nameEn: 'Sky Blue',
    hex: '#a8c6e4',
    aliases: ['blue', 'آبی', 'آسمانی'],
    stops: [
      { offset: 0, color: '#f0f6fd' },
      { offset: 30, color: '#aac6e6' },
      { offset: 52, color: '#e4eefa' },
      { offset: 78, color: '#89a9cd' },
      { offset: 100, color: '#d9e6f5' },
    ],
    wall: BLUE_WALL,
  },
  {
    code: 'black',
    name: 'مشکی',
    nameEn: 'Black',
    hex: '#1d1f22',
    aliases: ['black', 'مشکی', 'سیاه'],
    stops: [
      { offset: 0, color: '#6f7379' },
      { offset: 30, color: '#2b2e33' },
      { offset: 52, color: '#5a5e64' },
      { offset: 78, color: '#1d1f22' },
      { offset: 100, color: '#4a4e54' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'white',
    name: 'سفید',
    nameEn: 'White',
    hex: '#f2f3f5',
    aliases: ['white', 'سفید'],
    stops: [
      { offset: 0, color: '#ffffff' },
      { offset: 28, color: '#e9ebee' },
      { offset: 48, color: '#fcfcfd' },
      { offset: 72, color: '#d8dbe0' },
      { offset: 100, color: '#f6f7f9' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'mist-blue',
    name: 'آبی مه‌آلود',
    nameEn: 'Mist Blue',
    hex: '#9cb6d4',
    aliases: ['blue', 'آبی', 'مه‌آلود'],
    stops: [
      { offset: 0, color: '#eef4fb' },
      { offset: 30, color: '#a8c0da' },
      { offset: 52, color: '#e2ecf7' },
      { offset: 78, color: '#8aa5c4' },
      { offset: 100, color: '#d7e3f1' },
    ],
    wall: BLUE_WALL,
  },
  {
    code: 'sage',
    name: 'سبز مریم‌گلی',
    nameEn: 'Sage',
    hex: '#b9c7ae',
    aliases: ['green', 'سبز', 'مریم گلی'],
    stops: [
      { offset: 0, color: '#f2f6ee' },
      { offset: 30, color: '#bccbb1' },
      { offset: 52, color: '#e9f0e4' },
      { offset: 78, color: '#9fb094' },
      { offset: 100, color: '#dfe8d9' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'lavender',
    name: 'یاسی',
    nameEn: 'Lavender',
    hex: '#c9bedd',
    aliases: ['purple', 'بنفش', 'یاسی', 'لاوندر'],
    stops: [
      { offset: 0, color: '#f5f1f9' },
      { offset: 30, color: '#d3c9e3' },
      { offset: 52, color: '#efeaf6' },
      { offset: 78, color: '#bbafd1' },
      { offset: 100, color: '#e5dfee' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'black-titanium',
    name: 'تیتانیوم مشکی',
    nameEn: 'Black Titanium',
    hex: '#494d53',
    aliases: ['black', 'مشکی', 'تیتانیوم مشکی'],
    stops: [
      { offset: 0, color: '#8b8e94' },
      { offset: 30, color: '#44484e' },
      { offset: 52, color: '#777b82' },
      { offset: 78, color: '#33373c' },
      { offset: 100, color: '#63676d' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'white-titanium',
    name: 'تیتانیوم سفید',
    nameEn: 'White Titanium',
    hex: '#e6e4df',
    aliases: ['white', 'سفید', 'تیتانیوم سفید'],
    stops: [
      { offset: 0, color: '#ffffff' },
      { offset: 28, color: '#e4e2dd' },
      { offset: 48, color: '#f7f6f3' },
      { offset: 72, color: '#cfccc5' },
      { offset: 100, color: '#efede9' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'natural-titanium',
    name: 'تیتانیوم طبیعی',
    nameEn: 'Natural Titanium',
    hex: '#d6d2c9',
    aliases: ['natural', 'تیتانیوم طبیعی', 'نچرال'],
    stops: [
      { offset: 0, color: '#faf8f4' },
      { offset: 28, color: '#d8d3c8' },
      { offset: 48, color: '#f1eee8' },
      { offset: 72, color: '#c3bdb1' },
      { offset: 100, color: '#eae6de' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'desert-titanium',
    name: 'تیتانیوم صحرایی',
    nameEn: 'Desert Titanium',
    hex: '#c0996d',
    aliases: ['desert', 'صحرایی', 'طلایی'],
    stops: [
      { offset: 0, color: '#f6ead8' },
      { offset: 30, color: '#cfae85' },
      { offset: 52, color: '#efe0cb' },
      { offset: 78, color: '#b2905f' },
      { offset: 100, color: '#e7d7bf' },
    ],
    wall: WARM_WALL,
  },
  {
    code: 'ultramarine',
    name: 'اولترامارین',
    nameEn: 'Ultramarine',
    hex: '#7f92c4',
    aliases: ['blue', 'آبی', 'اولترامارین'],
    stops: [
      { offset: 0, color: '#e8ecf8' },
      { offset: 30, color: '#8c9ed0' },
      { offset: 52, color: '#dbe2f4' },
      { offset: 78, color: '#6d80b6' },
      { offset: 100, color: '#ccd6ee' },
    ],
    wall: BLUE_WALL,
  },
  {
    code: 'teal',
    name: 'سبزآبی',
    nameEn: 'Teal',
    hex: '#a9c8c4',
    aliases: ['teal', 'سبزآبی', 'فیروزه‌ای'],
    stops: [
      { offset: 0, color: '#eef7f5' },
      { offset: 30, color: '#a9c8c4' },
      { offset: 52, color: '#e2f0ee' },
      { offset: 78, color: '#8bb0ab' },
      { offset: 100, color: '#d6e9e6' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'pink',
    name: 'صورتی',
    nameEn: 'Pink',
    hex: '#e8ccd2',
    aliases: ['pink', 'صورتی', 'رز'],
    stops: [
      { offset: 0, color: '#fdf2f4' },
      { offset: 30, color: '#e9ccd3' },
      { offset: 52, color: '#f8e9ec' },
      { offset: 78, color: '#d3adb6' },
      { offset: 100, color: '#f3dfe3' },
    ],
    wall: DARK_WALL,
  },
  {
    code: 'glacier',
    name: 'آبی یخی',
    nameEn: 'Glacier',
    hex: '#aebfd6',
    aliases: ['glacier', 'گلیسیر', 'آبی', 'یخی', 'آبی روشن'],
    stops: [
      { offset: 0, color: '#eef3fa' },
      { offset: 30, color: '#b3c3d9' },
      { offset: 52, color: '#e2eaf5' },
      { offset: 78, color: '#94a7c1' },
      { offset: 100, color: '#d5e0ee' },
    ],
    wall: BLUE_WALL,
  },
  {
    code: 'burgundy',
    name: 'زرشکی',
    nameEn: 'Burgundy',
    hex: '#5b2230',
    aliases: ['burgundy', 'بورگاندی', 'زرشکی', 'قرمز', 'شرابی'],
    stops: [
      { offset: 0, color: '#9c5a67' },
      { offset: 30, color: '#5b2230' },
      { offset: 52, color: '#83485a' },
      { offset: 78, color: '#431823' },
      { offset: 100, color: '#6f3342' },
    ],
    wall: WARM_WALL,
  },
];

export const SEED_STORAGES = [
  { capacityGb: 128, label: '128GB', labelFa: '۱۲۸ گیگابایت', sortOrder: 1 },
  { capacityGb: 256, label: '256GB', labelFa: '۲۵۶ گیگابایت', sortOrder: 2 },
  { capacityGb: 512, label: '512GB', labelFa: '۵۱۲ گیگابایت', sortOrder: 3 },
  { capacityGb: 1024, label: '1TB', labelFa: '۱ ترابایت', sortOrder: 4 },
  { capacityGb: 2048, label: '2TB', labelFa: '۲ ترابایت', sortOrder: 5 },
];

export interface SeedVariant {
  color: string;
  storage: number;
  price: number;
  compareAtPrice?: number;
  stock: number;
  shippingTime: ShippingTime;
  isActive?: boolean;
}

/**
 * Sample prices, stock and ratings for development and the test suites only.
 * Texts, colours and capacities come from ./catalog/catalog.ts; a production
 * seed never uses these — prices there are entered by the owner.
 */
export interface SampleProduct {
  slug: string;
  basePrice: number;
  ratingAvg?: number;
  ratingCount?: number;
  variants: SeedVariant[];
}

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    slug: 'iphone-18-pro-max',
    basePrice: 189_900_000,
    ratingAvg: 4.9,
    ratingCount: 42,
    variants: [
      {
        color: 'burgundy',
        storage: 256,
        price: 189_900_000,
        compareAtPrice: 196_900_000,
        stock: 4,
        shippingTime: 'SAME_DAY',
      },
      { color: 'glacier', storage: 256, price: 189_900_000, stock: 3, shippingTime: 'SAME_DAY' },
      { color: 'black', storage: 512, price: 209_900_000, stock: 2, shippingTime: 'ONE_TO_TWO_DAYS' },
      { color: 'silver', storage: 1024, price: 239_900_000, stock: 1, shippingTime: 'PRE_ORDER' },
    ],
  },
  {
    slug: 'iphone-18-pro',
    basePrice: 172_900_000,
    ratingAvg: 4.8,
    ratingCount: 31,
    variants: [
      { color: 'glacier', storage: 256, price: 172_900_000, stock: 5, shippingTime: 'SAME_DAY' },
      { color: 'burgundy', storage: 256, price: 172_900_000, stock: 2, shippingTime: 'ONE_TO_TWO_DAYS' },
      { color: 'silver', storage: 512, price: 191_900_000, stock: 0, shippingTime: 'THREE_TO_FIVE_DAYS' },
    ],
  },
  {
    slug: 'iphone-17-pro-max',
    basePrice: 148_900_000,
    ratingAvg: 4.9,
    ratingCount: 218,
    variants: [
      {
        color: 'cosmic-orange',
        storage: 256,
        price: 148_900_000,
        compareAtPrice: 158_900_000,
        stock: 6,
        shippingTime: 'SAME_DAY',
      },
      { color: 'cosmic-orange', storage: 512, price: 168_900_000, stock: 3, shippingTime: 'ONE_TO_TWO_DAYS' },
      {
        color: 'deep-blue',
        storage: 256,
        price: 148_900_000,
        compareAtPrice: 156_900_000,
        stock: 4,
        shippingTime: 'SAME_DAY',
      },
      { color: 'deep-blue', storage: 1024, price: 189_900_000, stock: 2, shippingTime: 'ONE_TO_TWO_DAYS' },
      { color: 'silver', storage: 256, price: 147_900_000, stock: 5, shippingTime: 'SAME_DAY' },
      { color: 'silver', storage: 512, price: 167_900_000, stock: 0, shippingTime: 'THREE_TO_FIVE_DAYS' },
      { color: 'silver', storage: 2048, price: 218_900_000, stock: 1, shippingTime: 'PRE_ORDER' },
    ],
  },
  {
    slug: 'iphone-17-pro',
    basePrice: 136_900_000,
    ratingAvg: 4.8,
    ratingCount: 164,
    variants: [
      {
        color: 'cosmic-orange',
        storage: 256,
        price: 136_900_000,
        compareAtPrice: 144_900_000,
        stock: 7,
        shippingTime: 'SAME_DAY',
      },
      { color: 'cosmic-orange', storage: 512, price: 155_900_000, stock: 2, shippingTime: 'ONE_TO_TWO_DAYS' },
      { color: 'deep-blue', storage: 256, price: 136_900_000, stock: 4, shippingTime: 'SAME_DAY' },
      {
        color: 'silver',
        storage: 256,
        price: 135_900_000,
        compareAtPrice: 142_900_000,
        stock: 3,
        shippingTime: 'ONE_TO_TWO_DAYS',
      },
      { color: 'silver', storage: 1024, price: 175_900_000, stock: 0, shippingTime: 'WAREHOUSE' },
    ],
  },
  {
    slug: 'iphone-air',
    basePrice: 119_900_000,
    ratingAvg: 4.7,
    ratingCount: 96,
    variants: [
      {
        color: 'space-black',
        storage: 256,
        price: 119_900_000,
        compareAtPrice: 126_900_000,
        stock: 5,
        shippingTime: 'SAME_DAY',
      },
      { color: 'cloud-white', storage: 256, price: 119_900_000, stock: 2, shippingTime: 'ONE_TO_TWO_DAYS' },
      { color: 'light-gold', storage: 512, price: 138_900_000, stock: 3, shippingTime: 'ONE_TO_TWO_DAYS' },
      { color: 'sky-blue', storage: 256, price: 119_900_000, stock: 0, shippingTime: 'THREE_TO_FIVE_DAYS' },
      { color: 'sky-blue', storage: 1024, price: 159_900_000, stock: 1, shippingTime: 'WAREHOUSE' },
    ],
  },
  {
    slug: 'iphone-17',
    basePrice: 112_900_000,
    ratingAvg: 4.8,
    ratingCount: 143,
    variants: [
      {
        color: 'black',
        storage: 256,
        price: 112_900_000,
        compareAtPrice: 118_900_000,
        stock: 9,
        shippingTime: 'SAME_DAY',
      },
      { color: 'white', storage: 256, price: 112_900_000, stock: 6, shippingTime: 'SAME_DAY' },
      { color: 'mist-blue', storage: 256, price: 112_900_000, stock: 2, shippingTime: 'ONE_TO_TWO_DAYS' },
      { color: 'sage', storage: 512, price: 132_900_000, stock: 3, shippingTime: 'ONE_TO_TWO_DAYS' },
      {
        color: 'lavender',
        storage: 256,
        price: 112_900_000,
        compareAtPrice: 117_900_000,
        stock: 4,
        shippingTime: 'SAME_DAY',
      },
      { color: 'lavender', storage: 512, price: 132_900_000, stock: 0, shippingTime: 'WAREHOUSE' },
    ],
  },
  {
    slug: 'iphone-16-pro-max',
    basePrice: 124_900_000,
    ratingAvg: 4.7,
    ratingCount: 311,
    variants: [
      {
        color: 'black-titanium',
        storage: 256,
        price: 124_900_000,
        compareAtPrice: 133_900_000,
        stock: 4,
        shippingTime: 'ONE_TO_TWO_DAYS',
      },
      {
        color: 'natural-titanium',
        storage: 256,
        price: 124_900_000,
        stock: 2,
        shippingTime: 'ONE_TO_TWO_DAYS',
      },
      {
        color: 'desert-titanium',
        storage: 512,
        price: 142_900_000,
        stock: 1,
        shippingTime: 'THREE_TO_FIVE_DAYS',
      },
      { color: 'black-titanium', storage: 1024, price: 164_900_000, stock: 0, shippingTime: 'WAREHOUSE' },
    ],
  },
  {
    slug: 'iphone-16-pro',
    basePrice: 109_900_000,
    ratingAvg: 4.7,
    ratingCount: 188,
    variants: [
      {
        color: 'desert-titanium',
        storage: 128,
        price: 109_900_000,
        stock: 3,
        shippingTime: 'ONE_TO_TWO_DAYS',
      },
      {
        color: 'white-titanium',
        storage: 256,
        price: 119_900_000,
        compareAtPrice: 124_900_000,
        stock: 2,
        shippingTime: 'SAME_DAY',
      },
      { color: 'natural-titanium', storage: 256, price: 119_900_000, stock: 0, shippingTime: 'WAREHOUSE' },
    ],
  },
  {
    slug: 'iphone-16',
    basePrice: 89_900_000,
    ratingAvg: 4.6,
    ratingCount: 402,
    variants: [
      {
        color: 'ultramarine',
        storage: 128,
        price: 89_900_000,
        compareAtPrice: 95_900_000,
        stock: 8,
        shippingTime: 'SAME_DAY',
      },
      { color: 'teal', storage: 128, price: 89_900_000, stock: 5, shippingTime: 'SAME_DAY' },
      { color: 'pink', storage: 256, price: 97_900_000, stock: 2, shippingTime: 'ONE_TO_TWO_DAYS' },
      {
        color: 'black',
        storage: 256,
        price: 97_900_000,
        compareAtPrice: 103_900_000,
        stock: 6,
        shippingTime: 'SAME_DAY',
      },
      { color: 'white', storage: 512, price: 115_900_000, stock: 0, shippingTime: 'THREE_TO_FIVE_DAYS' },
    ],
  },
];

export const SEED_SHIPPING_METHODS = [
  {
    code: 'tehran-courier',
    name: 'پیک تهران (تحویل امروز)',
    description: 'تحویل در همان روز برای سفارش‌های ثبت‌شده تا ساعت ۱۵',
    calculator: 'city_courier',
    baseCost: 180_000,
    freeThreshold: null as number | null,
    etaLabel: 'همان روز',
    allowedProvinces: ['تهران'],
    sortOrder: 1,
  },
  {
    code: 'post-pishtaz',
    name: 'پست پیشتاز',
    description: 'ارسال به سراسر ایران با کد رهگیری',
    calculator: 'flat',
    baseCost: 120_000,
    freeThreshold: 50_000_000,
    etaLabel: '۲ تا ۴ روز کاری',
    allowedProvinces: [] as string[],
    sortOrder: 2,
  },
  {
    code: 'tipax',
    name: 'تیپاکس',
    description: 'ارسال سریع به مراکز استان‌ها',
    calculator: 'flat',
    baseCost: 220_000,
    freeThreshold: 80_000_000,
    etaLabel: '۱ تا ۳ روز کاری',
    allowedProvinces: [] as string[],
    sortOrder: 3,
  },
];
