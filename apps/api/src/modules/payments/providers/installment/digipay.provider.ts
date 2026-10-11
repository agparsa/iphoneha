import type { InstallmentTerms } from '@iphoneha/shared';
import { InstallmentProvider } from './installment.provider';
import type { InstallmentGatewayClient } from './installment-gateway.client';

/** دیجی‌پی — installment service adapter. */
export class DigipayProvider extends InstallmentProvider {
  constructor(client: InstallmentGatewayClient, termsFactory: () => Promise<InstallmentTerms>) {
    super('DIGIPAY', `digipay-${client.driver}`, client, termsFactory);
  }
}
