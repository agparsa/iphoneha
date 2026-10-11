'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CartDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import { trackAddToCart } from '@/lib/analytics';

interface AddToCartInput {
  variantId: string;
  quantity?: number;
  /** open the cart sheet after a successful add (default: true) */
  reveal?: boolean;
}

interface CartValue {
  cart: CartDto | null;
  itemsCount: number;
  isLoading: boolean;
  isMutating: boolean;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  addItem: (input: AddToCartInput) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({
  initialCart,
  children,
}: {
  initialCart: CartDto | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.cart,
    queryFn: () => api.get<CartDto>('/cart'),
    initialData: initialCart ?? undefined,
    staleTime: 15_000,
  });

  const setCart = useCallback(
    (cart: CartDto) => {
      queryClient.setQueryData(queryKeys.cart, cart);
    },
    [queryClient],
  );

  const add = useMutation({
    mutationFn: (input: AddToCartInput) =>
      api.post<CartDto>('/cart', { variantId: input.variantId, quantity: input.quantity ?? 1 }),
    onSuccess: (cart, input) => {
      setCart(cart);
      if (input.reveal !== false) setSheetOpen(true);
      toast.success('به سبد خرید اضافه شد');
      trackAddToCart(cart, input.variantId, input.quantity ?? 1);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      api.patch<CartDto>(`/cart/items/${itemId}`, { quantity }),
    onSuccess: setCart,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => api.delete<CartDto>(`/cart/items/${itemId}`),
    onSuccess: (cart) => {
      setCart(cart);
      toast.success('از سبد خرید حذف شد');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const coupon = useMutation({
    mutationFn: (code: string) => api.post<CartDto>('/cart/coupon', { code }),
    onSuccess: (cart) => {
      setCart(cart);
      toast.success('کد تخفیف اعمال شد');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const clearCoupon = useMutation({
    mutationFn: () => api.delete<CartDto>('/cart/coupon'),
    onSuccess: setCart,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const value = useMemo<CartValue>(
    () => ({
      cart: data ?? null,
      itemsCount: data?.summary.itemsCount ?? 0,
      isLoading,
      isMutating:
        add.isPending || update.isPending || remove.isPending || coupon.isPending || clearCoupon.isPending,
      sheetOpen,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false),
      addItem: async (input) => {
        await add.mutateAsync(input);
      },
      updateItem: async (itemId, quantity) => {
        await update.mutateAsync({ itemId, quantity });
      },
      removeItem: async (itemId) => {
        await remove.mutateAsync(itemId);
      },
      applyCoupon: async (code) => {
        await coupon.mutateAsync(code);
      },
      removeCoupon: async () => {
        await clearCoupon.mutateAsync();
      },
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      },
    }),
    [data, isLoading, add, update, remove, coupon, clearCoupon, sheetOpen, queryClient],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside <CartProvider>');
  return value;
}
