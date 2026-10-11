import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '@iphoneha/shared';
import { renderSms, type SmsMessage, type SmsProvider, type SmsSendResult } from './sms-provider.interface';

/** Development driver: prints the message (including OTP codes) to the API log. */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  readonly code = 'console';
  private readonly logger = new Logger('SMS');

  async send(to: string, message: SmsMessage): Promise<SmsSendResult> {
    this.logger.log(`→ ${maskPhone(to)} (${to})\n${renderSms(message)}`);
    return { provider: this.code, messageId: null, accepted: true };
  }
}
