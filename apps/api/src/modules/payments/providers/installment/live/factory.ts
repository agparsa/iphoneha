import {
  installmentBaseUrl,
  installmentDriver,
  type AppConfig,
  type LiveInstallmentMethod,
} from '../../../../../config/env.config';
import { AzkiVamClient } from './azkivam.client';
import { BajetClient } from './bajet.client';
import { DigipayClient } from './digipay.client';
import { defaultFetch, type FetchImpl } from './http';
import { SnappPayClient } from './snappay.client';
import { TaraClient } from './tara.client';

export type LiveInstallmentClient = SnappPayClient | TaraClient | DigipayClient | BajetClient | AzkiVamClient;

/**
 * The client of a service set to `live` or `sandbox` (null for `mock`) — the
 * one place that turns .env into a client. The API and
 * deploy/installment-check.cjs both use it, so a check run on the server talks
 * to exactly what the store talks to. Keys are not checked here: a service
 * with a key missing is never registered (see `missingLiveKeys`).
 */
export function liveInstallmentClient(
  method: LiveInstallmentMethod,
  config: AppConfig,
  fetchImpl: FetchImpl = defaultFetch,
): LiveInstallmentClient | null {
  const driver = installmentDriver(config, method);
  if (driver === 'mock') return null;
  const baseUrl = installmentBaseUrl(config, method);
  switch (method) {
    case 'SNAPPAY':
      return new SnappPayClient(
        {
          baseUrl,
          clientId: config.SNAPPAY_CLIENT_ID ?? '',
          clientSecret: config.SNAPPAY_CLIENT_SECRET ?? '',
          username: config.SNAPPAY_USERNAME ?? '',
          password: config.SNAPPAY_PASSWORD ?? '',
          commissionType: config.SNAPPAY_COMMISSION_TYPE ?? 100,
        },
        fetchImpl,
        driver,
      );
    case 'TARA':
      return new TaraClient(
        {
          baseUrl,
          username: config.TARA_USERNAME ?? '',
          password: config.TARA_PASSWORD ?? '',
          serviceId: config.TARA_SERVICE_ID ?? '',
          groupCode: config.TARA_GROUP_CODE,
        },
        fetchImpl,
        driver,
      );
    case 'DIGIPAY':
      return new DigipayClient(
        {
          baseUrl,
          clientId: config.DIGIPAY_CLIENT_ID ?? '',
          clientSecret: config.DIGIPAY_CLIENT_SECRET ?? '',
          username: config.DIGIPAY_USERNAME ?? '',
          password: config.DIGIPAY_PASSWORD ?? '',
          ticketType: config.DIGIPAY_TICKET_TYPE ?? 11,
          verifyStyle: config.DIGIPAY_VERIFY_STYLE,
          sellerId: config.DIGIPAY_SELLER_ID,
          supplierId: config.DIGIPAY_SUPPLIER_ID,
        },
        fetchImpl,
        driver,
      );
    case 'BOJET':
      return new BajetClient(
        {
          baseUrl,
          username: config.BAJET_USERNAME ?? '',
          password: config.BAJET_PASSWORD ?? '',
          terminalId: config.BAJET_TERMINAL_ID ?? '',
          productType: config.BAJET_PRODUCT_TYPE,
        },
        fetchImpl,
        driver,
      );
    case 'AZKIVAM':
      return new AzkiVamClient(
        { baseUrl, merchantId: config.AZKIVAM_MERCHANT_ID ?? '', apiKey: config.AZKIVAM_API_KEY ?? '' },
        fetchImpl,
        driver,
      );
    default:
      return null;
  }
}
