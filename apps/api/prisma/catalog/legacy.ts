/**
 * Specs exactly as earlier seeds wrote them. The catalogue sync replaces a
 * product's specs only while they still equal one of these — anything the
 * owner has edited in the admin panel is left alone.
 */
export const LEGACY_SPECS: Record<string, { key: string; value: string }[][]> = {
  'iphone-17-pro-max': [
    [
      { key: 'نمایشگر', value: '۶.۹ اینچ Super Retina XDR با ProMotion ۱۲۰ هرتز' },
      { key: 'تراشه', value: 'A19 Pro' },
      { key: 'دوربین اصلی', value: 'سه‌گانه ۴۸ مگاپیکسل با زوم ۸ برابر' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'باتری', value: 'تا ۳۹ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم یکپارچه با محفظه بخار' },
      { key: 'مقاومت', value: 'IP68 و Ceramic Shield 2' },
      { key: 'گارانتی', value: '۱۸ ماه آیفونی‌ها' },
    ],
  ],
  'iphone-17-pro': [
    [
      { key: 'نمایشگر', value: '۶.۳ اینچ Super Retina XDR با ProMotion ۱۲۰ هرتز' },
      { key: 'تراشه', value: 'A19 Pro' },
      { key: 'دوربین اصلی', value: 'سه‌گانه ۴۸ مگاپیکسل با زوم ۸ برابر' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'باتری', value: 'تا ۳۱ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم یکپارچه با محفظه بخار' },
      { key: 'گارانتی', value: '۱۸ ماه آیفونی‌ها' },
    ],
  ],
  'iphone-air': [
    [
      { key: 'نمایشگر', value: '۶.۵ اینچ Super Retina XDR با ProMotion' },
      { key: 'تراشه', value: 'A19 Pro' },
      { key: 'دوربین اصلی', value: '۴۸ مگاپیکسل Fusion' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'ضخامت', value: '۵.۶ میلی‌متر' },
      { key: 'بدنه', value: 'تیتانیوم درجه ۵' },
      { key: 'گارانتی', value: '۱۸ ماه آیفونی‌ها' },
    ],
  ],
  'iphone-17': [
    [
      { key: 'نمایشگر', value: '۶.۳ اینچ Super Retina XDR با ProMotion' },
      { key: 'تراشه', value: 'A19' },
      { key: 'دوربین اصلی', value: 'دوگانه ۴۸ مگاپیکسل' },
      { key: 'دوربین سلفی', value: '۱۸ مگاپیکسل Center Stage' },
      { key: 'باتری', value: 'تا ۳۰ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم هوافضا' },
      { key: 'گارانتی', value: '۱۸ ماه آیفونی‌ها' },
    ],
  ],
  'iphone-16-pro-max': [
    [
      { key: 'نمایشگر', value: '۶.۹ اینچ Super Retina XDR' },
      { key: 'تراشه', value: 'A18 Pro' },
      { key: 'دوربین اصلی', value: 'سه‌گانه ۴۸ مگاپیکسل با زوم ۵ برابر' },
      { key: 'باتری', value: 'تا ۳۳ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'تیتانیوم درجه ۵' },
      { key: 'گارانتی', value: '۱۸ ماه آیفونی‌ها' },
    ],
  ],
  'iphone-16': [
    [
      { key: 'نمایشگر', value: '۶.۱ اینچ Super Retina XDR' },
      { key: 'تراشه', value: 'A18' },
      { key: 'دوربین اصلی', value: 'دوگانه ۴۸ مگاپیکسل' },
      { key: 'باتری', value: 'تا ۲۲ ساعت پخش ویدیو' },
      { key: 'بدنه', value: 'آلومینیوم' },
      { key: 'گارانتی', value: '۱۸ ماه آیفونی‌ها' },
    ],
  ],
};
