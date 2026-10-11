import type { InstallmentTerms } from '@iphoneha/shared';
import { InstallmentProvider } from './installment.provider';
import type { InstallmentGatewayClient } from './installment-gateway.client';

/** ازکی‌وام — installment service adapter. */
export class AzkiVamProvider extends InstallmentProvider {
  constructor(client: InstallmentGatewayClient, termsFactory: () => Promise<InstallmentTerms>) {
    super('AZKIVAM', `azkivam-${client.driver}`, client, termsFactory);
  }
}
