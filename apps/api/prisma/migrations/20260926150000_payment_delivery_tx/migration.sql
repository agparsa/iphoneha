-- Live installment services: DigiPay credit purchases are settled only after
-- the store reports the delivery, and that call is logged like the others.
ALTER TYPE "PaymentTxType" ADD VALUE IF NOT EXISTS 'DELIVERY';
