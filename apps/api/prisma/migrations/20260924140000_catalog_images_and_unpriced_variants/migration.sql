-- DEVICE: the whole phone on a transparent background; DETAIL: a full-bleed close-up photo
CREATE TYPE "ProductImageKind" AS ENUM ('DEVICE', 'DETAIL');

ALTER TABLE "ProductImage" ADD COLUMN "kind" "ProductImageKind" NOT NULL DEFAULT 'DEVICE';

-- A colour × capacity the owner has not priced yet is stored with price 0 and
-- stays inactive; anything a customer can see or buy still needs a real price.
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_price_positive";
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_positive"
  CHECK ("price" > 0 OR ("price" = 0 AND "isActive" = false));
