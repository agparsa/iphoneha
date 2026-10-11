export type SmsMessage =
  | { kind: 'otp'; code: string }
  | { kind: 'order-paid'; orderNumber: string }
  /** «سفارش موفق»: order IH100012 for «۸۵٬۰۰۰٬۰۰۰» (toman) is placed and paid */
  | { kind: 'order-confirmed'; orderNumber: string; amount: string }
  | { kind: 'order-shipped'; orderNumber: string; trackingCode?: string | null }
  /** to the store's staff: a new «خرید قسطی با چک یا سفته» request, e.g. number ۱۲ with «چک صیادی» */
  | { kind: 'alert-credit-request'; number: string; method: string }
  /** to the store's staff: an order was just paid, e.g. IH100012 for «۸۵٬۰۰۰٬۰۰۰» (toman) */
  | { kind: 'alert-order-paid'; orderNumber: string; amount: string }
  /** to a customer of the store's own instalments: contract ۱۰۲۴, «۱۲٬۰۰۰٬۰۰۰» (toman), due «۱۴۰۵/۰۸/۱۰» */
  | { kind: 'installment-reminder'; contractNumber: string; amount: string; dueDate: string }
  /** an instalment past its due date, same figures as the reminder */
  | { kind: 'installment-overdue'; contractNumber: string; amount: string; dueDate: string }
  /** «پرداخت موفق» of an instalment: instalment ۳ of contract ۱۰۲۴, «۱۲٬۰۰۰٬۰۰۰» paid, «۴۸٬۰۰۰٬۰۰۰» still owed */
  | { kind: 'installment-paid'; index: string; contractNumber: string; amount: string; remaining: string }
  /** the instalment booklet of a new contract: ۱۲ instalments of «۹٬۴۲۰٬۰۰۰», the first due «۱۴۰۵/۰۸/۱۰» */
  | { kind: 'contract-issued'; contractNumber: string; months: string; monthly: string; firstDue: string }
  | { kind: 'text'; text: string };

export interface SmsSendResult {
  provider: string;
  messageId: string | null;
  accepted: boolean;
}

/** Pluggable SMS gateway. Add a provider by implementing this interface. */
export interface SmsProvider {
  readonly code: string;
  send(to: string, message: SmsMessage): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export function renderSms(message: SmsMessage, storeName = 'آیفونی‌ها'): string {
  switch (message.kind) {
    case 'otp':
      return `کد ورود شما به ${storeName}: ${message.code}\nاین کد را در اختیار دیگران نگذارید.`;
    case 'order-paid':
      return `${storeName}\nپرداخت سفارش ${message.orderNumber} با موفقیت انجام شد.`;
    case 'order-confirmed':
      return `${storeName}\nسفارش ${message.orderNumber} به مبلغ ${message.amount} تومان با موفقیت ثبت شد.\nپیگیری: iphoneha.com/account/orders`;
    case 'order-shipped':
      return message.trackingCode
        ? `${storeName}\nسفارش ${message.orderNumber} ارسال شد. کد رهگیری: ${message.trackingCode}`
        : `${storeName}\nسفارش ${message.orderNumber} ارسال شد.`;
    case 'alert-credit-request':
      return `${storeName}\nدرخواست خرید قسطی تازه، شمارهٔ ${message.number} با ${message.method}. برای تماس به پنل سر بزنید.`;
    case 'alert-order-paid':
      return `${storeName}\nسفارش ${message.orderNumber} به مبلغ ${message.amount} تومان پرداخت شد.`;
    case 'installment-reminder':
      return `${storeName}\nیادآوری قسط قرارداد ${message.contractNumber} به مبلغ ${message.amount} تومان با سررسید ${message.dueDate}.`;
    case 'installment-overdue':
      return `${storeName}\nقسط قرارداد ${message.contractNumber} به مبلغ ${message.amount} تومان از سررسید ${message.dueDate} پرداخت نشده است. لطفاً هرچه زودتر پرداخت کنید.`;
    case 'installment-paid':
      return `${storeName}\nپرداخت قسط ${message.index} قرارداد ${message.contractNumber} به مبلغ ${message.amount} تومان ثبت شد. مانده: ${message.remaining} تومان`;
    case 'contract-issued':
      return `${storeName}\nدفترچه اقساط قرارداد ${message.contractNumber} صادر شد: ${message.months} قسط ${message.monthly} تومانی، اولین سررسید ${message.firstDue}.\niphoneha.com/account/installments`;
    case 'text':
      return message.text;
  }
}
