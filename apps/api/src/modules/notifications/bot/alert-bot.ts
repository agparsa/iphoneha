import { Logger } from '@nestjs/common';
import { bodySnippet, networkReason } from '../../../common/http/network-error';

export type AlertBotService = 'telegram' | 'bale';

/** Sends the staff's alerts to one chat: the owner's own chat with the bot, or a staff group. */
export interface AlertBot {
  readonly service: AlertBotService;
  send(text: string): Promise<void>;
}

/** null when no bot is set up on the server (deploy/alerts.sh). */
export const ALERT_BOT = Symbol('ALERT_BOT');

/** Bale's bot API is a copy of Telegram's: same methods, same answers, another address. */
export const BOT_API_BASE: Record<AlertBotService, string> = {
  telegram: 'https://api.telegram.org',
  bale: 'https://tapi.bale.ai',
};

const SERVICE_NAMES: Record<AlertBotService, string> = { telegram: 'Telegram', bale: 'Bale' };

interface BotApiResponse {
  ok?: boolean;
  description?: string;
  error_code?: number;
}

/**
 * `sendMessage` of the Telegram (or Bale) bot API.
 *
 * The token is part of the request URL, so the URL is never logged or put in
 * an error — only the service name, the HTTP status and the API's own answer.
 */
export class BotApiAlertBot implements AlertBot {
  private readonly logger = new Logger('AlertBot');

  constructor(
    readonly service: AlertBotService,
    private readonly token: string,
    private readonly chatId: string,
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  /** Anything that could quote the request URL (a malformed-URL error, a proxy page) loses the token. */
  private redact(text: string): string {
    return text.replaceAll(this.token, '<token>');
  }

  async send(text: string): Promise<void> {
    const name = SERVICE_NAMES[this.service];
    let response: Response;
    try {
      response = await this.fetchImpl(`${BOT_API_BASE[this.service]}/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          // the panel link would only preview the login page
          ...(this.service === 'telegram' ? { link_preview_options: { is_disabled: true } } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const reason = this.redact(networkReason(error));
      this.logger.error(`${name} unreachable: ${reason}`);
      throw new Error(`${name} unreachable: ${reason}`);
    }

    const raw = await response.text().catch(() => '');
    let json: BotApiResponse | null;
    try {
      json = JSON.parse(raw) as BotApiResponse;
    } catch {
      json = null;
    }
    if (!json || typeof json !== 'object') {
      const detail = this.redact(`HTTP ${response.status} ${bodySnippet(raw)}`.trim());
      this.logger.error(`${name} unreachable: ${detail}`);
      throw new Error(`${name} unreachable: ${detail}`);
    }
    if (!response.ok || json.ok !== true) {
      // e.g. 401 Unauthorized (wrong token), 400 chat not found, 403 the bot was blocked by the user
      const detail = this.redact(`${json.error_code ?? response.status} ${json.description ?? ''}`.trim());
      this.logger.error(`${name} refused the alert: ${detail}`);
      throw new Error(`${name} refused: ${detail}`);
    }
  }
}
