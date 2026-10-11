/** React-Query cache keys shared by the client components. */
export const queryKeys = {
  cart: ['cart'] as const,
  me: ['me'] as const,
  addresses: ['addresses'] as const,
  sessions: ['sessions'] as const,
  orders: (page: number) => ['orders', page] as const,
  order: (id: string) => ['order', id] as const,
  variants: (slug: string) => ['variants', slug] as const,
  suggest: (q: string) => ['suggest', q] as const,
  checkoutQuote: (payload: unknown) => ['checkout-quote', payload] as const,
  shipping: (province: string | null, amount: number) => ['shipping', province, amount] as const,
  paymentMethods: (amount: number) => ['payment-methods', amount] as const,
};
