import { Global, Logger, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { QUEUE_NOTIFICATIONS } from '../../infra/queue/queue.constants';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './notification.processor';
import { AlertsService } from './alerts.service';
import { ALERT_BOT, BotApiAlertBot, type AlertBot } from './bot/alert-bot';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { KavenegarSmsProvider } from './sms/kavenegar-sms.provider';
import { MelipayamakSmsProvider } from './sms/melipayamak-sms.provider';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms-provider.interface';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })],
  providers: [
    NotificationService,
    NotificationProcessor,
    AlertsService,
    {
      provide: ALERT_BOT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): AlertBot | null => {
        const { ALERT_BOT_TOKEN: token, ALERT_BOT_CHAT_ID: chatId } = config;
        if (token && chatId) return new BotApiAlertBot(config.ALERT_BOT_SERVICE, token, chatId);
        if (token || chatId) {
          new Logger('AlertBot').warn(
            'ALERT_BOT_TOKEN and ALERT_BOT_CHAT_ID go together — the bot stays off',
          );
        }
        return null;
      },
    },
    {
      provide: SMS_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): SmsProvider => {
        switch (config.SMS_DRIVER) {
          case 'kavenegar':
            return new KavenegarSmsProvider(config.KAVENEGAR_API_KEY!, config.KAVENEGAR_OTP_TEMPLATE);
          case 'melipayamak':
            return new MelipayamakSmsProvider(config.MELIPAYAMAK_USERNAME!, config.MELIPAYAMAK_PASSWORD!, {
              otp: config.MELIPAYAMAK_OTP_BODY_ID!,
              orderPaid: config.MELIPAYAMAK_ORDER_PAID_BODY_ID,
              orderShipped: config.MELIPAYAMAK_ORDER_SHIPPED_BODY_ID,
              alertCreditRequest: config.MELIPAYAMAK_ALERT_REQUEST_BODY_ID,
              alertOrderPaid: config.MELIPAYAMAK_ALERT_ORDER_BODY_ID,
              installmentReminder: config.MELIPAYAMAK_INSTALLMENT_REMINDER_BODY_ID,
              orderConfirmed: config.MELIPAYAMAK_ORDER_CONFIRMED_BODY_ID,
              installmentOverdue: config.MELIPAYAMAK_INSTALLMENT_OVERDUE_BODY_ID,
              installmentPaid: config.MELIPAYAMAK_INSTALLMENT_PAID_BODY_ID,
              contractIssued: config.MELIPAYAMAK_CONTRACT_ISSUED_BODY_ID,
            });
          default:
            return new ConsoleSmsProvider();
        }
      },
    },
  ],
  exports: [NotificationService, AlertsService, SMS_PROVIDER, ALERT_BOT],
})
export class NotificationModule {}
