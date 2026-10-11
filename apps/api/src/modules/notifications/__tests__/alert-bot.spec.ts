import { BotApiAlertBot } from '../bot/alert-bot';

type FetchCall = { url: string; init: RequestInit };

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

function fakeFetch(status: number, body: unknown) {
  const calls: FetchCall[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('BotApiAlertBot', () => {
  it('posts the text to the chat through Telegram, without a link preview', async () => {
    const { impl, calls } = fakeFetch(200, { ok: true, result: { message_id: 7 } });
    const bot = new BotApiAlertBot('telegram', TOKEN, '-1001234567890', impl);

    await bot.send('درخواست خرید قسطی تازه');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      chat_id: '-1001234567890',
      text: 'درخواست خرید قسطی تازه',
      link_preview_options: { is_disabled: true },
    });
  });

  it('uses the same method at Bale’s address', async () => {
    const { impl, calls } = fakeFetch(200, { ok: true, result: {} });
    const bot = new BotApiAlertBot('bale', TOKEN, '98765', impl);

    await bot.send('سلام');

    expect(calls[0]!.url).toBe(`https://tapi.bale.ai/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ chat_id: '98765', text: 'سلام' });
  });

  it('reports the API’s own reason when it refuses, so the queue retries and the log explains', async () => {
    const { impl } = fakeFetch(403, {
      ok: false,
      error_code: 403,
      description: 'Forbidden: bot was blocked by the user',
    });
    const bot = new BotApiAlertBot('telegram', TOKEN, '42', impl);

    await expect(bot.send('x')).rejects.toThrow(
      'Telegram refused: 403 Forbidden: bot was blocked by the user',
    );
  });

  it('treats a page that is not the API’s JSON as no answer', async () => {
    const { impl } = fakeFetch(502, '<html><h1>502 Bad Gateway</h1></html>');
    const bot = new BotApiAlertBot('bale', TOKEN, '42', impl);

    await expect(bot.send('x')).rejects.toThrow('Bale unreachable: HTTP 502 502 Bad Gateway');
  });

  it('never puts the token in an error, even when the error quotes the URL', async () => {
    const impl = (async (url: string) => {
      throw new TypeError(`Failed to parse URL from ${url}`);
    }) as unknown as typeof fetch;
    const bot = new BotApiAlertBot('telegram', TOKEN, '42', impl);

    const error = await bot.send('x').catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Telegram unreachable');
    expect((error as Error).message).not.toContain(TOKEN);
  });
});
