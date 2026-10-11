-- Extras Prisma's schema language cannot express: database-level invariants,
-- the order-number sequence and the trigram index used by product search.

-- ── Product search ──────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Product_searchText_trgm_idx" ON "Product" USING gin ("searchText" gin_trgm_ops);

-- ── Human friendly order numbers (IH100001, IH100002, …) ────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 100001 INCREMENT BY 1;

-- ── Inventory invariants: overselling is impossible even with a code bug ────
ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_stock_non_negative" CHECK ("stock" >= 0),
  ADD CONSTRAINT "Inventory_reserved_non_negative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "Inventory_sold_non_negative" CHECK ("sold" >= 0),
  ADD CONSTRAINT "Inventory_reserved_not_above_stock" CHECK ("reserved" <= "stock");

-- ── Quantities and money ────────────────────────────────────────────────────
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_positive" CHECK ("price" > 0);
ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_compare_at_above_price"
  CHECK ("compareAtPrice" IS NULL OR "compareAtPrice" > "price");
ALTER TABLE "Order" ADD CONSTRAINT "Order_total_non_negative" CHECK ("total" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_non_negative" CHECK ("amount" >= 0);

-- ── A session belongs to exactly one subject ────────────────────────────────
ALTER TABLE "Session" ADD CONSTRAINT "Session_subject_exclusive" CHECK (
  ("kind" = 'USER' AND "userId" IS NOT NULL AND "adminUserId" IS NULL) OR
  ("kind" = 'ADMIN' AND "adminUserId" IS NOT NULL AND "userId" IS NULL)
);
