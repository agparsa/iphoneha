import {
  tomanToRial,
  type CartDto,
  type CartItemDto,
  type OrderDto,
  type ProductDetailDto,
  type VariantDto,
} from '@iphoneha/shared';

/**
 * Google Analytics 4 ecommerce events: a product seen, added to the cart,
 * checkout started, an order paid. Every call does nothing unless the owner
 * set a GA4 id in the admin (only then is the tag on the page), and nothing
 * that identifies the customer is ever sent — no name, phone or address, only
 * what was viewed or bought. GA knows rials (IRR), not tomans, so amounts ×10.
 */

interface AnalyticsItem {
  item_id: string;
  item_name: string;
  item_brand: string;
  item_category: string;
  item_variant?: string;
  price: number;
  quantity: number;
}

type Gtag = (command: 'event', name: string, params: Record<string, unknown>) => void;

const BRAND = 'Apple';
const CATEGORY = 'گوشی موبایل';

function send(name: string, params: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const gtag = (window as Window & { gtag?: Gtag }).gtag;
  if (typeof gtag !== 'function') return;
  try {
    gtag('event', name, { currency: 'IRR', ...params });
  } catch {
    // analytics must never get in the way of a purchase
  }
}

function cartItem(item: CartItemDto, quantity = item.quantity): AnalyticsItem {
  return {
    item_id: item.sku,
    item_name: item.productName,
    item_brand: BRAND,
    item_category: CATEGORY,
    item_variant: `${item.color.name} · ${item.storage.labelFa}`,
    price: tomanToRial(item.unitPrice),
    quantity,
  };
}

/** The product page, with the colour and capacity it opened on. */
export function trackViewItem(product: ProductDetailDto, variant: VariantDto): void {
  const color = product.colors.find((c) => c.id === variant.colorId)?.name;
  const storage = product.storages.find((s) => s.id === variant.storageId)?.labelFa;
  const item: AnalyticsItem = {
    item_id: variant.sku,
    item_name: product.name,
    item_brand: BRAND,
    item_category: CATEGORY,
    ...(color && storage ? { item_variant: `${color} · ${storage}` } : {}),
    price: tomanToRial(variant.price),
    quantity: 1,
  };
  send('view_item', { value: item.price, items: [item] });
}

/** `quantity` is how many were just added, not the line's new total. */
export function trackAddToCart(cart: CartDto, variantId: string, quantity: number): void {
  const line = cart.items.find((item) => item.variantId === variantId);
  if (!line) return;
  const item = cartItem(line, quantity);
  send('add_to_cart', { value: item.price * item.quantity, items: [item] });
}

export function trackBeginCheckout(cart: CartDto): void {
  if (cart.items.length === 0) return;
  const items = cart.items.map((item) => cartItem(item));
  send('begin_checkout', {
    value: tomanToRial(cart.summary.subtotal - cart.summary.discount),
    ...(cart.couponCode ? { coupon: cart.couponCode } : {}),
    items,
  });
}

/**
 * A paid order. GA drops a second purchase with the same transaction id, and
 * the result page also remembers the ones it already reported, so reloading
 * the page never counts the sale twice.
 */
export function trackPurchase(order: OrderDto): void {
  const items: AnalyticsItem[] = order.items.map((item) => ({
    item_id: item.sku,
    item_name: item.productName,
    item_brand: BRAND,
    item_category: CATEGORY,
    // the same wording as the product page and the cart, so GA sees one variant
    item_variant: `${item.colorName} · ${item.storageLabel}`,
    price: tomanToRial(item.unitPrice),
    quantity: item.quantity,
  }));
  send('purchase', {
    transaction_id: order.orderNumber,
    // what was paid for the goods; shipping is reported beside it
    value: tomanToRial(order.total - order.shippingCost),
    shipping: tomanToRial(order.shippingCost),
    ...(order.couponCode ? { coupon: order.couponCode } : {}),
    payment_type: order.paymentMethod,
    items,
  });
}

/** A request to buy with a Sayad cheque or a promissory note — the store's lead. */
export function trackLead(method: 'CHEQUE' | 'SAFTE', model: { name: string; price: number } | null): void {
  send('generate_lead', {
    lead_source: method === 'CHEQUE' ? 'cheque' : 'safte',
    ...(model ? { item_name: model.name, value: tomanToRial(model.price) } : {}),
  });
}

/** A tap on one of the store's phone numbers (most instalment purchases start with a call). */
export function trackCallClick(page: string): void {
  send('click_to_call', { page_path: page });
}

/** A tap on a story's button on the home page: which story, and on which of its slides. */
export function trackStoryClick(story: string, label: string, slide: string): void {
  send('select_promotion', { promotion_id: story, promotion_name: label, creative_slot: slide });
}
