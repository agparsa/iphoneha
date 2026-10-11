import type { InstallmentTerms } from '@iphoneha/shared';
import { InstallmentProvider } from './installment.provider';
import type { InstallmentGatewayClient } from './installment-gateway.client';

/** باجت — installment service adapter. */
export class BojetProvider extends InstallmentProvider {
  constructor(client: InstallmentGatewayClient, termsFactory: () => Promise<InstallmentTerms>) {
    super('BOJET', `bojet-${client.driver}`, client, termsFactory);
  }
}
