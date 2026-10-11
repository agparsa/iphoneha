import type { InstallmentTerms } from '@iphoneha/shared';
import { InstallmentProvider } from './installment.provider';
import type { InstallmentGatewayClient } from './installment-gateway.client';

/** اسنپ‌پی — installment service adapter. */
export class SnapPayProvider extends InstallmentProvider {
  constructor(client: InstallmentGatewayClient, termsFactory: () => Promise<InstallmentTerms>) {
    super('SNAPPAY', `snappay-${client.driver}`, client, termsFactory);
  }
}
