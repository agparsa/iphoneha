import {
  ADMIN_ORDER_TRANSITIONS,
  ORDER_TRANSITIONS,
  canAdminTransition,
  canTransition,
  transitionRequiresRefund,
} from '../order-state';
import { ORDER_STATUSES } from '../enums';
import { roleCanSetOrderStatus, roleHasPermission, ROLE_PERMISSIONS, PERMISSIONS } from '../permissions';

describe('order state machine', () => {
  it('defines transitions for every status', () => {
    for (const s of ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[s]).toBeDefined();
      expect(ADMIN_ORDER_TRANSITIONS[s]).toBeDefined();
    }
  });

  it('admin transitions are a subset of all transitions', () => {
    for (const s of ORDER_STATUSES) {
      for (const t of ADMIN_ORDER_TRANSITIONS[s]) expect(ORDER_TRANSITIONS[s]).toContain(t);
    }
  });

  it('follows the happy path', () => {
    expect(canTransition('PENDING', 'PAYMENT_PENDING')).toBe(true);
    expect(canTransition('PAYMENT_PENDING', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'READY_TO_SHIP')).toBe(true);
    expect(canTransition('READY_TO_SHIP', 'SHIPPED')).toBe(true);
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
  });

  it('blocks illegal transitions', () => {
    expect(canTransition('DELIVERED', 'PENDING')).toBe(false);
    expect(canTransition('CANCELLED', 'PAID')).toBe(false);
    expect(canAdminTransition('PAYMENT_PENDING', 'PAID')).toBe(false);
    expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
  });

  it('requires refunds only for captured money', () => {
    expect(transitionRequiresRefund('PAID', 'CANCELLED')).toBe(true);
    expect(transitionRequiresRefund('DELIVERED', 'REFUNDED')).toBe(true);
    expect(transitionRequiresRefund('PAYMENT_PENDING', 'CANCELLED')).toBe(false);
  });
});

describe('permissions', () => {
  it('super admin has everything', () => {
    for (const p of PERMISSIONS) expect(roleHasPermission('SUPER_ADMIN', p)).toBe(true);
  });

  it('manager cannot manage admins', () => {
    expect(roleHasPermission('MANAGER', 'admins.manage')).toBe(false);
    expect(roleHasPermission('MANAGER', 'products.write')).toBe(true);
  });

  it('support only reads, apart from following up instalment requests and noting calls', () => {
    const writes = ROLE_PERMISSIONS.SUPPORT.filter((p) => !p.endsWith('.read'));
    expect(writes).toEqual(['leads.write', 'users.notes']);
    expect(roleCanSetOrderStatus('SUPPORT', 'SHIPPED')).toBe(false);
    expect(roleHasPermission('SUPPORT', 'content.read')).toBe(false);
    expect(roleHasPermission('WAREHOUSE', 'leads.read')).toBe(false);
  });

  it('warehouse can fulfil but not refund', () => {
    expect(roleHasPermission('WAREHOUSE', 'inventory.write')).toBe(true);
    expect(roleHasPermission('WAREHOUSE', 'payments.refund')).toBe(false);
    expect(roleCanSetOrderStatus('WAREHOUSE', 'SHIPPED')).toBe(true);
    expect(roleCanSetOrderStatus('WAREHOUSE', 'CANCELLED')).toBe(false);
  });
});
