import { Injectable, Logger } from '@nestjs/common';
import { renderSms, type SmsMessage, type SmsProvider, type SmsSendResult } from './sms-provider.interface';

interface KavenegarResponse {
  return?: { status?: number; message?: string };
  entries?: { messageid?: number; status?: number }[] | null;
}

/**
 * Kavenegar driver.
 * OTPs go through the "verify/lookup" endpoint (template based, required by
 * Iranian regulations); everything else uses the plain send endpoint.
 */
@Injectable()
export class KavenegarSmsProvider implements SmsProvider {
  readonly code = 'kavenegar';
  private readonly logger = new Logger('SMS');

  constructor(
    private readonly apiKey: string,
    private readonly otpTemplate: string,
  ) {}

  async send(to: string, message: SmsMessage): Promise<SmsSendResult> {
    const url =
      message.kind === 'otp'
        ? `https://api.kavenegar.com/v1/${this.apiKey}/verify/lookup.json?receptor=${encodeURIComponent(
            to,
          )}&token=${encodeURIComponent(message.code)}&template=${encodeURIComponent(this.otpTemplate)}`
        : `https://api.kavenegar.com/v1/${this.apiKey}/sms/send.json?receptor=${encodeURIComponent(
            to,
          )}&message=${encodeURIComponent(renderSms(message))}`;

    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15_000) });
    const body = (await response.json().catch(() => ({}))) as KavenegarResponse;
    const status = body.return?.status ?? response.status;
    const accepted = response.ok && status === 200;
    if (!accepted) {
      this.logger.error(`Kavenegar rejected the message: ${status} ${body.return?.message ?? ''}`);
      throw new Error(`Kavenegar error ${status}: ${body.return?.message ?? 'unknown'}`);
    }
    return {
      provider: this.code,
      messageId: body.entries?.[0]?.messageid ? String(body.entries[0]!.messageid) : null,
      accepted: true,
    };
  }
}
