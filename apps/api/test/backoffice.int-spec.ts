import { inflateRawSync } from 'node:zlib';
import { addDaysIso, formatJalali, formatJalaliInput, formatNumberFa, tehranToday } from '@iphoneha/shared';
import {
  SMS_PROVIDER,
  type SmsMessage,
  type SmsProvider,
  type SmsSendResult,
} from '../src/modules/notifications/sms/sms-provider.interface';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { anonymous, login, loginAdmin, type Actor } from './utils/actors';
import { resetDb, setStock, stockOf } from './utils/db';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

/** Keeps every SMS instead of sending it. */
class RecordingSms implements SmsProvider {
  readonly code = 'recording';
  sent: { to: string; message: SmsMessage }[] = [];

  async send(to: string, message: SmsMessage): Promise<SmsSendResult> {
    this.sent.push({ to, message });
    return { provider: this.code, messageId: String(this.sent.length), accepted: true };
  }
}

async function eventually<T>(read: () => T, done: (value: T) => boolean, timeoutMs = 5_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (done(value) || Date.now() - started > timeoutMs) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** A Luhn-valid IMEI from a 14-digit body. */
function imei(body: string): string {
  const digits = body.padStart(14, '0').slice(-14);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(digits[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits + String((10 - (sum % 10)) % 10);
}

/** One file out of an .xlsx (a zip), to check what the sheet says. */
function readZipEntry(zip: Buffer, name: string): string {
  let at = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(at + 10);
  at = zip.readUInt32LE(at + 16);
  for (let i = 0; i < count; i++) {
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    const offset = zip.readUInt32LE(at + 42);
    const size = zip.readUInt32LE(at + 20);
    const entry = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    if (entry === name) {
      const localName = zip.readUInt16LE(offset + 26);
      const localExtra = zip.readUInt16LE(offset + 28);
      const start = offset + 30 + localName + localExtra;
      return inflateRawSync(zip.subarray(start, start + size)).toString('utf8');
    }
    at += 46 + nameLength + extra + comment;
  }
  throw new Error(`${name} is not in the workbook`);
}

const binary = (
  res: NodeJS.ReadableStream & { setEncoding: (e: string) => void },
  done: (e: Error | null, b?: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('Back office: IMEI, phone and in-store orders, instalment book, prices, reports', () => {
  let ctx: TestContext;
  let owner: Actor;
  let warehouse: Actor;
  const sms = new RecordingSms();
  let prices: { id: string; price: bigint; compareAtPrice: bigint | null; discountPercent: number }[] = [];

  beforeAll(async () => {
    ctx = await createTestApp((builder) => builder.overrideProvider(SMS_PROVIDER).useValue(sms));
    prices = await ctx.prisma.productVariant.findMany({
      select: { id: true, price: true, compareAtPrice: true, discountPercent: true },
    });
  });
  afterAll(async () => {
    for (const row of prices) {
      await ctx.prisma.productVariant.update({
        where: { id: row.id },
        data: { price: row.price, compareAtPrice: row.compareAtPrice, discountPercent: row.discountPercent },
      });
    }
    await ctx.prisma.setting.deleteMany({ where: { key: 'ledger' } });
    await resetDb(ctx.prisma, ctx.redis);
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
    await ctx.prisma.setting.deleteMany({ where: { key: 'ledger' } });
    owner = await loginAdmin(ctx, '09120000000');
    warehouse = await loginAdmin(ctx, '09120000001');
    sms.sent = [];
  });

  const post = (actor: Actor, url: string, body: unknown) =>
    actor.agent
      .post(url)
      .set('x-csrf-token', actor.csrf)
      .send(body as object);
  const patch = (actor: Actor, url: string, body: unknown) =>
    actor.agent
      .patch(url)
      .set('x-csrf-token', actor.csrf)
      .send(body as object);

  /** A priced, active variant with at least `min` on the shelf. */
  async function variantWithStock(min = 2, skip: string[] = []) {
    const variant = await ctx.prisma.productVariant.findFirstOrThrow({
      where: { isActive: true, price: { gt: 0 }, inventory: { stock: { gte: min } }, id: { notIn: skip } },
      orderBy: { sku: 'asc' },
    });
    return { id: variant.id, price: Number(variant.price) };
  }

  async function receive(
    actor: Actor,
    variantId: string,
    units: { imei: string; serialNumber?: string }[],
    costPrice?: number,
  ) {
    const response = await post(actor, '/api/admin/devices/receive', {
      variantId,
      units,
      costPrice,
      supplier: 'پخش آزمایشی',
    }).expect(201);
    const devices = await ctx.prisma.deviceUnit.findMany({
      where: { imei: { in: units.map((u) => u.imei) } },
    });
    return { result: response.body, ids: units.map((u) => devices.find((d) => d.imei === u.imei)!.id) };
  }

  function inStoreOrder(variantId: string, extra: Record<string, unknown> = {}) {
    return {
      source: 'IN_STORE',
      customer: { phone: '09121112233', firstName: 'رضا', lastName: 'کریمی' },
      items: [{ variantId, quantity: 1, deviceIds: [] }],
      delivery: { type: 'PICKUP' },
      payment: { method: 'IN_STORE', channel: 'POS', reference: '123456' },
      ...extra,
    };
  }

  /** Down payment, a 3-month schedule with a markup, and one cheque per instalment. */
  function chequeTerms(price: number) {
    const today = tehranToday();
    const downPayment = Math.round(price * 0.2);
    const payable = Math.round((price - downPayment) * 1.12);
    const first = Math.floor(payable / 3);
    const amounts = [first, first, payable - 2 * first];
    const dues = [30, 60, 90].map((days) => addDaysIso(today, days));
    return {
      downPayment,
      amounts,
      dues,
      contract: {
        downPayment,
        downPaymentChannel: 'POS',
        monthlyFeePercent: 4,
        contractDate: today,
        installments: amounts.map((amount, i) => ({ dueDate: dues[i], amount })),
        cheques: amounts.map((amount, i) => ({
          installmentIndex: i + 1,
          sayadId: `123456789012345${i + 1}`,
          bankName: 'ملت',
          drawerName: 'رضا کریمی',
          amount,
          dueDate: dues[i],
        })),
        guarantor: { name: 'حسن کریمی', phone: '09123334455' },
      },
    };
  }

  it('receives phones by IMEI, keeps the stock count in step and refuses duplicates', async () => {
    const variant = await variantWithStock(1);
    const before = await stockOf(ctx.prisma, variant.id);
    const [a, b] = [imei('35000000000001'), imei('35000000000002')];

    // the warehouse team receives stock (inventory.write)
    const { result, ids } = await receive(
      warehouse,
      variant.id,
      [{ imei: a }, { imei: b, serialNumber: 'F2LXQ1ABCD' }],
      80_000_000,
    );
    expect(result).toMatchObject({ created: 2, stock: before.stock + 2 });
    expect((await stockOf(ctx.prisma, variant.id)).stock).toBe(before.stock + 2);

    const duplicate = await post(owner, '/api/admin/devices/receive', {
      variantId: variant.id,
      units: [{ imei: a }],
    }).expect(409);
    expect(duplicate.body.message).toContain(a);
    await post(owner, '/api/admin/devices/receive', {
      variantId: variant.id,
      units: [{ imei: '350000000000011' }],
    }).expect(400);
    await post(owner, '/api/admin/devices/receive', {
      variantId: variant.id,
      units: [{ imei: a }, { imei: a }],
    }).expect(400);

    // a faulty phone leaves the sellable stock, and comes back when repaired
    await patch(owner, `/api/admin/devices/${ids[1]}`, { status: 'DEFECTIVE', note: 'صفحه خط دارد' }).expect(
      200,
    );
    expect((await stockOf(ctx.prisma, variant.id)).stock).toBe(before.stock + 1);
    await patch(owner, `/api/admin/devices/${ids[1]}`, { status: 'IN_STOCK' }).expect(200);
    expect((await stockOf(ctx.prisma, variant.id)).stock).toBe(before.stock + 2);

    const lookup = await owner.agent.get(`/api/admin/devices/lookup?q=${a}`).expect(200);
    expect(lookup.body).toMatchObject({ imei: a, status: 'IN_STOCK', costPrice: 80_000_000 });
    const list = await owner.agent.get(`/api/admin/devices?variantId=${variant.id}`).expect(200);
    expect(list.body.total).toBe(2);

    // an unsold phone received by mistake can be removed; the count follows
    await owner.agent.delete(`/api/admin/devices/${ids[0]}`).set('x-csrf-token', owner.csrf).expect(204);
    expect((await stockOf(ctx.prisma, variant.id)).stock).toBe(before.stock + 1);
  });

  it('sells in the store with the IMEI and takes the phone back on a refund', async () => {
    const variant = await variantWithStock(1);
    const before = await stockOf(ctx.prisma, variant.id);
    const a = imei('35000000000011');
    const { ids } = await receive(owner, variant.id, [{ imei: a }], 90_000_000);

    const order = await post(
      owner,
      '/api/admin/orders',
      inStoreOrder(variant.id, {
        items: [{ variantId: variant.id, quantity: 1, deviceIds: ids }],
        discount: 1_000_000,
        handedOver: true,
      }),
    ).expect(201);
    expect(order.body).toMatchObject({
      status: 'DELIVERED',
      source: 'IN_STORE',
      paymentMethod: 'IN_STORE',
      total: variant.price - 1_000_000,
      createdByName: expect.any(String),
      contract: null,
    });
    expect(order.body.devices).toEqual([expect.objectContaining({ imei: a })]);
    expect((await stockOf(ctx.prisma, variant.id)).stock).toBe(before.stock);
    expect(await ctx.prisma.deviceUnit.findUniqueOrThrow({ where: { imei: a } })).toMatchObject({
      status: 'SOLD',
    });
    expect(await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: order.body.id } })).toMatchObject({
      provider: 'manual',
      status: 'SUCCEEDED',
      method: 'IN_STORE',
    });

    // the list filters by where the order came from, and an IMEI finds its order
    expect((await owner.agent.get('/api/admin/orders?source=IN_STORE').expect(200)).body.total).toBe(1);
    expect((await owner.agent.get('/api/admin/orders?source=PHONE').expect(200)).body.total).toBe(0);
    expect((await owner.agent.get(`/api/admin/orders?q=${a.slice(-9)}`).expect(200)).body.items[0].id).toBe(
      order.body.id,
    );
    const today = formatJalaliInput(tehranToday());
    expect(
      (
        await owner.agent
          .get(`/api/admin/orders?from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}`)
          .expect(200)
      ).body.total,
    ).toBe(1);

    // the customer brings it back: the money is returned by hand, the phone waits to be checked
    await patch(owner, `/api/admin/orders/${order.body.id}`, { status: 'REFUNDED', note: 'مرجوعی' }).expect(
      200,
    );
    expect(await ctx.prisma.deviceUnit.findUniqueOrThrow({ where: { imei: a } })).toMatchObject({
      status: 'RETURNED',
    });
    expect((await stockOf(ctx.prisma, variant.id)).stock).toBe(before.stock + 1);
    expect(await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: order.body.id } })).toMatchObject({
      status: 'REFUNDED',
    });

    // a phone order that never left the store: the phone goes straight back on the shelf
    const b = imei('35000000000012');
    const second = await receive(owner, variant.id, [{ imei: b }]);
    const phoneOrder = await post(owner, '/api/admin/orders', {
      ...inStoreOrder(variant.id, { items: [{ variantId: variant.id, quantity: 1, deviceIds: second.ids }] }),
      source: 'PHONE',
    }).expect(201);
    expect(phoneOrder.body.status).toBe('PAID');
    await patch(owner, `/api/admin/orders/${phoneOrder.body.id}`, {
      status: 'CANCELLED',
      note: 'انصراف',
    }).expect(200);
    expect(await ctx.prisma.deviceUnit.findUniqueOrThrow({ where: { imei: b } })).toMatchObject({
      status: 'IN_STOCK',
      orderItemId: null,
    });
  });

  it('refuses a sale beyond the stock, a phone of another model and a discount above the price', async () => {
    const variant = await variantWithStock(1);
    const other = await variantWithStock(1, [variant.id]);
    await setStock(ctx.prisma, variant.id, 1);
    const short = await post(
      owner,
      '/api/admin/orders',
      inStoreOrder(variant.id, { items: [{ variantId: variant.id, quantity: 2, deviceIds: [] }] }),
    ).expect(409);
    expect(short.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await ctx.prisma.order.count()).toBe(0);
    const { ids } = await receive(owner, other.id, [{ imei: imei('35000000000021') }]);
    const wrong = await post(
      owner,
      '/api/admin/orders',
      inStoreOrder(variant.id, { items: [{ variantId: variant.id, quantity: 1, deviceIds: ids }] }),
    ).expect(400);
    expect(wrong.body.code).toBe('DEVICE_WRONG_VARIANT');
    await post(owner, '/api/admin/orders', inStoreOrder(variant.id, { discount: variant.price + 1 })).expect(
      400,
    );
    await post(
      owner,
      '/api/admin/orders',
      inStoreOrder(variant.id, { delivery: { type: 'PICKUP' }, handedOver: true, source: 'PHONE' }),
    ).expect(201);
  });

  it('writes a cheque contract with a phone order and collects it to the end', async () => {
    const variant = await variantWithStock(1);
    const terms = chequeTerms(variant.price);
    const methods = await ctx.prisma.shippingMethod.findFirstOrThrow({ where: { isActive: true } });
    const order = await post(owner, '/api/admin/orders', {
      source: 'PHONE',
      customer: { phone: '09121112233', firstName: 'رضا', lastName: 'کریمی' },
      items: [{ variantId: variant.id, quantity: 1 }],
      delivery: {
        type: 'SHIP',
        shippingMethodId: methods.id,
        shippingCost: 0,
        address: {
          recipientName: 'رضا کریمی',
          mobile: '09121112233',
          province: 'تهران',
          city: 'تهران',
          addressLine: 'خیابان آزمایشی، پلاک ۱',
          postalCode: '1234567890',
        },
      },
      payment: { method: 'CHEQUE', contract: terms.contract },
      notifyCustomer: true,
    }).expect(201);
    expect(order.body).toMatchObject({
      paymentMethod: 'CHEQUE',
      status: 'PAID',
      contract: { number: 1, status: 'ACTIVE' },
    });
    const id = order.body.contract.id as string;
    const payable = terms.amounts.reduce((a, b) => a + b, 0);
    // «سفارش موفق» and the booklet of the new contract, straight from its schedule
    const issued = await eventually(
      () => sms.sent,
      (sent) =>
        sent.some((s) => s.message.kind === 'order-confirmed') &&
        sent.some((s) => s.message.kind === 'contract-issued'),
    );
    expect(issued.find((s) => s.message.kind === 'order-confirmed')).toMatchObject({
      to: '09121112233',
      message: { orderNumber: order.body.orderNumber, amount: formatNumberFa(variant.price) },
    });
    expect(issued.find((s) => s.message.kind === 'contract-issued')).toMatchObject({
      to: '09121112233',
      message: {
        contractNumber: '۱',
        months: '۳',
        monthly: formatNumberFa(terms.amounts[0]!),
        firstDue: formatJalali(terms.contract.installments[0]!.dueDate),
      },
    });
    let contract = (await owner.agent.get(`/api/admin/ledger/contracts/${id}`).expect(200)).body;
    expect(contract).toMatchObject({
      method: 'CHEQUE',
      cashPrice: variant.price,
      downPayment: terms.downPayment,
      financed: variant.price - terms.downPayment,
      totalPayable: terms.downPayment + payable,
      paid: terms.downPayment,
      remaining: payable,
      months: 3,
      guarantorName: 'حسن کریمی',
      orderNumber: order.body.orderNumber,
    });
    expect(contract.cheques.map((c: { installmentIndex: number }) => c.installmentIndex)).toEqual([1, 2, 3]);
    expect((await owner.agent.get('/api/admin/ledger/contracts/1').expect(200)).body.id).toBe(id);

    const summary = (await owner.agent.get('/api/admin/ledger/summary').expect(200)).body;
    expect(summary).toMatchObject({
      activeContracts: 1,
      outstanding: payable,
      dueNext30Days: { count: 1, amount: terms.amounts[0] },
    });
    expect((await owner.agent.get('/api/admin/ledger/dues?days=45').expect(200)).body.total).toBe(1);
    expect((await owner.agent.get('/api/admin/ledger/dues?days=100').expect(200)).body.total).toBe(3);
    expect(
      (await owner.agent.get('/api/admin/ledger/cheques?q=1234567890123452').expect(200)).body.items,
    ).toHaveLength(1);

    // cash for the first instalment and a little more: the rest goes to the next one
    contract = (
      await post(owner, `/api/admin/ledger/contracts/${id}/payments`, {
        amount: terms.amounts[0] + 1_000,
        channel: 'CASH',
      }).expect(201)
    ).body;
    expect(contract.installments.map((i: { status: string }) => i.status)).toEqual([
      'PAID',
      'PENDING',
      'PENDING',
    ]);
    expect(contract.installments[1].paidAmount).toBe(1_000);
    // «پرداخت قسط ثبت شد» with what the contract still owes
    const paidSms = await eventually(
      () => sms.sent.filter((s) => s.message.kind === 'installment-paid'),
      (sent) => sent.length === 1,
    );
    expect(paidSms[0]!.message).toMatchObject({
      index: '۱',
      contractNumber: '۱',
      amount: formatNumberFa(terms.amounts[0]! + 1_000),
      remaining: formatNumberFa(contract.remaining),
    });
    // and none when the staff untick it
    await post(owner, `/api/admin/ledger/contracts/${id}/payments`, {
      amount: 500,
      channel: 'CASH',
      notifyCustomer: false,
    }).expect(201);
    await post(owner, `/api/admin/ledger/contracts/${id}/payments`, {
      amount: 500,
      channel: 'CASH',
      notifyCustomer: false,
    }).expect(201);
    contract = (await owner.agent.get(`/api/admin/ledger/contracts/${id}`).expect(200)).body;
    expect(contract.installments[1].paidAmount).toBe(2_000);
    expect(sms.sent.filter((s) => s.message.kind === 'installment-paid')).toHaveLength(1);
    const over = await post(owner, `/api/admin/ledger/contracts/${id}/payments`, {
      amount: contract.remaining + 1,
      channel: 'CASH',
    }).expect(409);
    expect(over.body.code).toBe('OVERPAYMENT');

    // the second cheque clears at the bank: its instalment, then the surplus to the third
    const cheques = contract.cheques as { id: string; installmentIndex: number }[];
    const second = cheques.find((c) => c.installmentIndex === 2)!.id;
    const third = cheques.find((c) => c.installmentIndex === 3)!.id;
    const first = cheques.find((c) => c.installmentIndex === 1)!.id;
    await post(owner, `/api/admin/ledger/cheques/${second}/action`, { action: 'CONFIRM_SAYAD' }).expect(201);
    await post(owner, `/api/admin/ledger/cheques/${second}/action`, { action: 'DEPOSIT' }).expect(201);
    contract = (
      await post(owner, `/api/admin/ledger/cheques/${second}/action`, { action: 'CLEAR' }).expect(201)
    ).body;
    expect(contract.installments.map((i: { status: string }) => i.status)).toEqual([
      'PAID',
      'PAID',
      'PENDING',
    ]);
    expect(contract.installments[2].paidAmount).toBe(2_000);
    // a cleared cheque is a paid instalment too
    const cleared = await eventually(
      () => sms.sent.filter((s) => s.message.kind === 'installment-paid'),
      (sent) => sent.length === 2,
    );
    expect(cleared.map((s) => (s.message as { index: string }).index)).toEqual(['۱', '۲']);
    await post(owner, `/api/admin/ledger/cheques/${second}/action`, { action: 'BOUNCE' }).expect(409);

    // cleared by mistake: voiding takes back every row of that cheque
    const chequePayment = (contract.payments as { id: string; chequeId: string | null }[]).find(
      (p) => p.chequeId === second,
    )!;
    contract = (await post(owner, `/api/admin/ledger/payments/${chequePayment.id}/void`, {}).expect(201))
      .body;
    expect(contract.installments.map((i: { status: string }) => i.status)).toEqual([
      'PAID',
      'PENDING',
      'PENDING',
    ]);
    expect(contract.installments[1].paidAmount).toBe(2_000);
    expect(contract.installments[2].paidAmount).toBe(0);
    expect(contract.cheques.find((c: { id: string }) => c.id === second).status).toBe('DEPOSITED');
    await post(owner, `/api/admin/ledger/payments/${chequePayment.id}/void`, {}).expect(409);

    await post(owner, `/api/admin/ledger/cheques/${second}/action`, { action: 'CLEAR' }).expect(201);
    contract = (
      await post(owner, `/api/admin/ledger/cheques/${third}/action`, { action: 'CLEAR' }).expect(201)
    ).body;
    expect(contract.status).toBe('COMPLETED');
    expect(contract.remaining).toBe(0);
    // the third cheque paid 2,000 more than was left: kept on record as the customer's credit
    expect(contract.paid).toBe(terms.downPayment + payable + 2_000);

    // the first cheque was never needed: back to the customer
    contract = (
      await post(owner, `/api/admin/ledger/cheques/${first}/action`, { action: 'RETURN' }).expect(201)
    ).body;
    expect(contract.cheques.find((c: { id: string }) => c.id === first).status).toBe('RETURNED');
    expect((await owner.agent.get('/api/admin/ledger/summary').expect(200)).body.activeContracts).toBe(0);

    // the same Sayad ID cannot secure a second contract
    const again = await post(owner, '/api/admin/ledger/contracts', {
      method: 'CHEQUE',
      customer: { name: 'رضا کریمی', phone: '09121112233' },
      itemDescription: 'آیفون',
      cashPrice: variant.price,
      ...terms.contract,
    }).expect(409);
    expect(again.body.code).toBe('CHEQUE_EXISTS');
  });

  it('reminds by SMS when turned on, and stops collecting when the order is cancelled', async () => {
    const variant = await variantWithStock(1);
    const today = tehranToday();
    const order = await post(owner, '/api/admin/orders', {
      ...inStoreOrder(variant.id),
      payment: {
        method: 'SAFTE',
        contract: {
          downPayment: 0,
          contractDate: today,
          installments: [
            { dueDate: addDaysIso(today, 2), amount: Math.ceil(variant.price / 2) },
            { dueDate: addDaysIso(today, 32), amount: Math.ceil(variant.price / 2) },
          ],
          saftes: [{ serial: '123456', amount: variant.price * 2, electronic: false }],
        },
      },
    }).expect(201);
    const ledger = ctx.app.get(LedgerService);
    expect(await ledger.runDailyReminders()).toBe(0); // off until turned on

    await patch(owner, '/api/admin/settings/ledger', {
      remindersEnabled: true,
      remindDaysBefore: 2,
      overdueEveryDays: 3,
      contractTerms: '',
    }).expect(200);
    expect(await ledger.runDailyReminders()).toBe(1);
    const reminders = await eventually(
      () => sms.sent.filter((s) => s.message.kind === 'installment-reminder'),
      (sent) => sent.length === 1,
    );
    expect(reminders[0]).toMatchObject({
      to: '09121112233',
      message: { kind: 'installment-reminder', contractNumber: '۱' },
    });
    expect(await ledger.runDailyReminders()).toBe(0); // once a day

    // past its due date it becomes «قسط معوق», every few days
    const overdueRow = await ctx.prisma.installment.findFirstOrThrow({
      where: { contractId: order.body.contract.id, index: 1 },
    });
    await ctx.prisma.installment.update({
      where: { id: overdueRow.id },
      data: { dueDate: new Date(`${addDaysIso(today, -3)}T00:00:00.000Z`), remindedAt: null },
    });
    expect(await ledger.runDailyReminders()).toBe(1);
    const overdue = await eventually(
      () => sms.sent.filter((s) => s.message.kind === 'installment-overdue'),
      (sent) => sent.length === 1,
    );
    expect(overdue[0]!.message).toMatchObject({
      contractNumber: '۱',
      dueDate: formatJalali(addDaysIso(today, -3)),
    });

    const contract = (
      await owner.agent.get(`/api/admin/ledger/contracts/${order.body.contract.id}`).expect(200)
    ).body;
    await post(owner, `/api/admin/ledger/installments/${contract.installments[1].id}/remind`, {}).expect(201);
    expect(contract.saftes[0]).toMatchObject({ status: 'HELD', amount: variant.price * 2 });

    await patch(owner, `/api/admin/orders/${order.body.id}`, {
      status: 'CANCELLED',
      note: 'انصراف مشتری',
    }).expect(200);
    const cancelled = (
      await owner.agent.get(`/api/admin/ledger/contracts/${order.body.contract.id}`).expect(200)
    ).body;
    expect(cancelled).toMatchObject({ status: 'CANCELLED', remaining: 0 });
    expect(cancelled.cancelReason).toContain('انصراف مشتری');
    await post(owner, `/api/admin/ledger/contracts/${cancelled.id}/payments`, {
      amount: 1_000,
      channel: 'CASH',
    }).expect(409);
    // the promissory note goes back to the customer
    const safte = await post(owner, `/api/admin/ledger/saftes/${cancelled.saftes[0].id}/action`, {
      action: 'RETURN',
    }).expect(201);
    expect(safte.body.saftes[0].status).toBe('RETURNED');
  });

  it('writes a contract for a request from the website, once', async () => {
    const request = await ctx.prisma.creditRequest.create({
      data: {
        name: 'مریم احمدی',
        phone: '09125556677',
        method: 'SAFTE',
        productName: 'آیفون ۱۷ پرو',
        months: 6,
      },
    });
    const today = tehranToday();
    const body = {
      method: 'SAFTE',
      creditRequestId: request.id,
      customer: { name: 'مریم احمدی', phone: '09125556677' },
      itemDescription: 'آیفون ۱۷ پرو ۲۵۶ گیگابایت',
      cashPrice: 60_000_000,
      downPayment: 20_000_000,
      downPaymentChannel: 'CASH',
      contractDate: formatJalaliInput(today),
      installments: [1, 2].map((m) => ({ dueDate: addDaysIso(today, 30 * m), amount: 22_000_000 })),
      saftes: [{ serial: '998877', amount: 80_000_000, electronic: true }],
    };
    const contract = (await post(owner, '/api/admin/ledger/contracts', body).expect(201)).body;
    expect(contract).toMatchObject({
      method: 'SAFTE',
      creditRequestNumber: request.number,
      financed: 40_000_000,
      markup: 4_000_000,
      paid: 20_000_000,
    });
    expect((await ctx.prisma.creditRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe(
      'CONTRACTED',
    );
    const twice = await post(owner, '/api/admin/ledger/contracts', body).expect(409);
    expect(twice.body.code).toBe('REQUEST_HAS_CONTRACT');

    // a due date moved and the last instalment forgiven: the totals follow
    const [first, second] = contract.installments as { id: string }[];
    let updated = (
      await patch(owner, `/api/admin/ledger/installments/${first!.id}`, {
        amount: 21_000_000,
        dueDate: addDaysIso(today, 35),
      }).expect(200)
    ).body;
    expect(updated).toMatchObject({ markup: 3_000_000, totalPayable: 63_000_000 });
    updated = (
      await patch(owner, `/api/admin/ledger/installments/${second!.id}`, {
        waive: true,
        note: 'تخفیف خوش‌حسابی',
      }).expect(200)
    ).body;
    expect(updated.installments[1].status).toBe('WAIVED');
    updated = (
      await post(owner, `/api/admin/ledger/contracts/${contract.id}/payments`, {
        amount: 21_000_000,
        channel: 'TRANSFER',
        reference: 'پایا ۱۲۳',
      }).expect(201)
    ).body;
    expect(updated.status).toBe('COMPLETED');
    await post(owner, `/api/admin/ledger/contracts/${contract.id}/status`, { status: 'DEFAULTED' }).expect(
      409,
    );
  });

  it('keeps the new pages behind their permissions', async () => {
    await warehouse.agent.get('/api/admin/ledger/summary').expect(403);
    await post(warehouse, '/api/admin/orders', {}).expect(403);
    await warehouse.agent.get('/api/admin/reports/sales?from=2026-09-01&to=2026-09-30').expect(403);
    await warehouse.agent.get('/api/admin/exports/orders').expect(403);
    await warehouse.agent.get('/api/admin/customers/09121112233').expect(403);
    expect((await warehouse.agent.get('/api/admin/dashboard').expect(200)).body.ledger).toBeNull();
    expect((await owner.agent.get('/api/admin/dashboard').expect(200)).body.ledger).toMatchObject({
      activeContracts: 0,
    });
    await ctx.http().get('/api/admin/exports/orders').expect(401);
  });

  it('changes many prices with a preview and keeps their history', async () => {
    const product = await ctx.prisma.product.findFirstOrThrow({
      where: { variants: { some: { price: { gt: 0 } } } },
      include: { variants: { where: { price: { gt: 0 } }, orderBy: { sku: 'asc' }, take: 2 } },
    });
    const ids = product.variants.map((v) => v.id);
    const round = (n: number) => Math.round(n / 100_000) * 100_000;

    const preview = (
      await post(owner, '/api/admin/pricing/bulk', { variantIds: ids, mode: 'PERCENT', value: 5 }).expect(201)
    ).body;
    expect(preview.applied).toBe(false);
    expect(preview.rows.map((r: { newValue: number }) => r.newValue)).toEqual(
      product.variants.map((v) => round(Number(v.price) * 1.05)),
    );
    expect(Number((await ctx.prisma.productVariant.findUniqueOrThrow({ where: { id: ids[0] } })).price)).toBe(
      Number(product.variants[0]!.price),
    );

    const applied = (
      await post(owner, '/api/admin/pricing/bulk', {
        variantIds: ids,
        mode: 'PERCENT',
        value: 5,
        dryRun: false,
      }).expect(201)
    ).body;
    expect(applied).toMatchObject({ applied: true, batchId: expect.any(String) });
    expect(Number((await ctx.prisma.productVariant.findUniqueOrThrow({ where: { id: ids[0] } })).price)).toBe(
      round(Number(product.variants[0]!.price) * 1.05),
    );
    const history = (await owner.agent.get(`/api/admin/pricing/history?variantId=${ids[0]}`).expect(200))
      .body;
    expect(history[0]).toMatchObject({
      batchId: applied.batchId,
      oldPrice: Number(product.variants[0]!.price),
    });

    // a «before discount» price under the sale price is skipped, not saved
    const low = (
      await post(owner, '/api/admin/pricing/bulk', {
        variantIds: [ids[0]],
        target: 'COMPARE_AT',
        mode: 'SET',
        value: 1_000_000,
        dryRun: false,
      }).expect(201)
    ).body;
    expect(low.rows).toHaveLength(0);
    expect(low.skipped).toHaveLength(1);

    // an edit of one price is part of the same history
    await patch(owner, `/api/admin/variants/${ids[0]}`, { price: 123_400_000 }).expect(200);
    const after = (await owner.agent.get(`/api/admin/pricing/history?variantId=${ids[0]}`).expect(200)).body;
    expect(after[0]).toMatchObject({ newPrice: 123_400_000, batchId: null });
    const table = (await owner.agent.get(`/api/admin/pricing?productId=${product.id}`).expect(200)).body;
    expect(table.find((row: { variantId: string }) => row.variantId === ids[0])).toMatchObject({
      price: 123_400_000,
      lastChange: expect.any(Object),
    });
  });

  it('reports the sales of a range and exports every list to Excel', async () => {
    const variant = await variantWithStock(2);
    const { ids } = await receive(owner, variant.id, [{ imei: imei('35000000000031') }], 70_000_000);
    await post(
      owner,
      '/api/admin/orders',
      inStoreOrder(variant.id, {
        items: [{ variantId: variant.id, quantity: 1, deviceIds: ids }],
        handedOver: true,
      }),
    ).expect(201);
    const phone = await post(owner, '/api/admin/orders', {
      ...inStoreOrder(variant.id),
      source: 'PHONE',
      discount: 500_000,
    }).expect(201);

    const today = tehranToday();
    const report = (await owner.agent.get(`/api/admin/reports/sales?from=${today}&to=${today}`).expect(200))
      .body;
    expect(report.totals).toMatchObject({
      orders: 2,
      units: 2,
      revenue: variant.price * 2 - 500_000,
      discount: 500_000,
      costOfGoods: 70_000_000,
      grossProfit: null,
      costCoverage: { unitsWithCost: 1, units: 2 },
    });
    expect(report.bySource.map((r: { source: string }) => r.source).sort()).toEqual(['IN_STORE', 'PHONE']);
    expect(report.byPaymentMethod).toEqual([expect.objectContaining({ method: 'IN_STORE', orders: 2 })]);
    expect(report.byDay).toEqual([{ date: today, orders: 2, revenue: variant.price * 2 - 500_000 }]);
    // the same range typed as Jalali dates
    const jalali = encodeURIComponent(formatJalaliInput(today));
    expect(
      (await owner.agent.get(`/api/admin/reports/sales?from=${jalali}&to=${jalali}`).expect(200)).body.totals
        .orders,
    ).toBe(2);
    await owner.agent.get(`/api/admin/reports/sales?from=${today}&to=${addDaysIso(today, -1)}`).expect(400);

    const file = await owner.agent
      .get(`/api/admin/exports/orders?from=${today}&to=${today}`)
      .buffer(true)
      .parse(binary as never)
      .expect(200);
    expect(file.headers['content-type']).toContain('spreadsheetml');
    expect(file.headers['content-disposition']).toMatch(
      /attachment; filename="iphoneha-orders-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );
    const sheet = readZipEntry(file.body as Buffer, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain(phone.body.orderNumber);
    expect(sheet).toContain('rightToLeft="1"');

    for (const kind of ['customers', 'installments', 'cheques', 'devices', 'sales']) {
      const response = await owner.agent
        .get(`/api/admin/exports/${kind}`)
        .buffer(true)
        .parse(binary as never)
        .expect(200);
      expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    }
    await owner.agent.get('/api/admin/exports/passwords').expect(404);
  });

  it("shows customers their own instalment booklets, and no one else's", async () => {
    const variant = await variantWithStock(1);
    const terms = chequeTerms(variant.price);
    const order = await post(owner, '/api/admin/orders', {
      ...inStoreOrder(variant.id),
      payment: { method: 'CHEQUE', contract: terms.contract },
    }).expect(201);
    const number = order.body.contract.number as number;
    await post(owner, `/api/admin/ledger/contracts/${order.body.contract.id}/payments`, {
      amount: terms.amounts[0],
      channel: 'CASH',
    }).expect(201);
    // a contract written for the same mobile before the account was used
    const today = tehranToday();
    await post(owner, '/api/admin/ledger/contracts', {
      method: 'SAFTE',
      customer: { name: 'رضا کریمی', phone: '09121112233' },
      itemDescription: 'آیفون ۱۶',
      cashPrice: 30_000_000,
      downPayment: 0,
      contractDate: formatJalaliInput(today),
      installments: [1, 2].map((m) => ({ dueDate: addDaysIso(today, 30 * m), amount: 16_000_000 })),
      saftes: [{ serial: '445566', amount: 40_000_000, electronic: false }],
      notifyCustomer: false,
    }).expect(201);

    const customer = await login(ctx, '09121112233');
    const list = (await customer.agent.get('/api/users/me/installments').expect(200)).body as {
      number: number;
      methodLabel: string;
    }[];
    expect(list.map((row) => row.number).sort()).toEqual([number, number + 1]);

    const booklet = (await customer.agent.get(`/api/users/me/installments/${number}`).expect(200)).body;
    expect(booklet).toMatchObject({
      number,
      method: 'CHEQUE',
      cashPrice: variant.price,
      downPayment: terms.downPayment,
      totalPayable: terms.downPayment + terms.amounts.reduce((a, b) => a + b, 0),
      paid: terms.downPayment + terms.amounts[0]!,
      paidCount: 1,
      nextDue: { index: 2, amount: terms.amounts[1] },
    });
    expect(booklet.installments.map((row: { amount: number }) => row.amount)).toEqual(terms.amounts);
    expect(booklet.installments[0].cheque).toEqual({
      bankName: 'ملت',
      sayadTail: '3451',
      statusLabel: expect.any(String),
    });
    // what only the staff see stays out
    const raw = JSON.stringify(booklet);
    for (const hidden of ['1234567890123451', 'guarantor', 'recordedByName', 'حسن کریمی']) {
      expect(raw).not.toContain(hidden);
    }

    // someone else gets nothing, not even a hint the contract exists
    const stranger = await login(ctx, '09127778899');
    expect((await stranger.agent.get('/api/users/me/installments').expect(200)).body).toEqual([]);
    await stranger.agent.get(`/api/users/me/installments/${number}`).expect(404);
    await (await anonymous(ctx)).agent.get('/api/users/me/installments').expect(401);
  });

  it("shows a customer's page with orders, contracts and the staff's notes", async () => {
    const variant = await variantWithStock(1);
    const terms = chequeTerms(variant.price);
    await post(owner, '/api/admin/orders', {
      ...inStoreOrder(variant.id),
      payment: { method: 'CHEQUE', contract: terms.contract },
    }).expect(201);

    const profile = (await owner.agent.get('/api/admin/customers/09121112233').expect(200)).body;
    expect(profile).toMatchObject({
      phone: '09121112233',
      fullName: 'رضا کریمی',
      stats: { paidOrders: 1, ledgerOutstanding: terms.amounts.reduce((a, b) => a + b, 0) },
    });
    expect(profile.orders).toHaveLength(1);
    expect(profile.contracts).toHaveLength(1);

    const note = (
      await post(owner, `/api/admin/customers/${profile.id}/notes`, { body: 'فقط عصرها تماس بگیرید' }).expect(
        201,
      )
    ).body;
    expect((await owner.agent.get(`/api/admin/customers/${profile.id}`).expect(200)).body.notes).toEqual([
      expect.objectContaining({ id: note.id, body: 'فقط عصرها تماس بگیرید' }),
    ]);
    await owner.agent
      .delete(`/api/admin/customer-notes/${note.id}`)
      .set('x-csrf-token', owner.csrf)
      .expect(204);
    await owner.agent.get('/api/admin/customers/09129999999').expect(404);
  });

  it('moves several orders at once and lists the ones that cannot move', async () => {
    const variant = await variantWithStock(3);
    const a = await post(owner, '/api/admin/orders', { ...inStoreOrder(variant.id), source: 'PHONE' }).expect(
      201,
    );
    const b = await post(owner, '/api/admin/orders', { ...inStoreOrder(variant.id), source: 'PHONE' }).expect(
      201,
    );
    const c = await post(owner, '/api/admin/orders', inStoreOrder(variant.id, { handedOver: true })).expect(
      201,
    );

    const result = (
      await post(owner, '/api/admin/orders/bulk-status', {
        orderIds: [a.body.id, b.body.id, c.body.id],
        status: 'PROCESSING',
      }).expect(201)
    ).body;
    expect(result.updated.sort()).toEqual([a.body.orderNumber, b.body.orderNumber].sort());
    expect(result.failed).toEqual([expect.objectContaining({ orderNumber: c.body.orderNumber })]);

    // «آماده ارسال» → «تحویل شد»: collected at the store
    await patch(owner, `/api/admin/orders/${a.body.id}`, { status: 'READY_TO_SHIP' }).expect(200);
    await patch(owner, `/api/admin/orders/${a.body.id}`, { status: 'DELIVERED' }).expect(200);

    const noted = (
      await patch(owner, `/api/admin/orders/${b.body.id}/note`, {
        adminNote: 'قبل از ارسال تماس گرفته شود',
      }).expect(200)
    ).body;
    expect(noted.adminNote).toBe('قبل از ارسال تماس گرفته شود');
  });
});
