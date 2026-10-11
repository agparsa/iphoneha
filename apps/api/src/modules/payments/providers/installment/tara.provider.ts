import type { InstallmentTerms } from '@iphoneha/shared';
import { InstallmentProvider } from './installment.provider';
import type { InstallmentGatewayClient } from './installment-gateway.client';

/** تارا — installment service adapter. */
export class TaraProvider extends InstallmentProvider {
  constructor(client: InstallmentGatewayClient, termsFactory: () => Promise<InstallmentTerms>) {
    super('TARA', `tara-${client.driver}`, client, termsFactory);
  }
}
