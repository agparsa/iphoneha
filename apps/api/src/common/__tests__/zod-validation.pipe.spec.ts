import { z } from 'zod';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { AppError } from '../errors';

const schema = z.object({
  quantity: z.coerce.number().int().min(1, 'حداقل تعداد ۱ است'),
  note: z.string().max(5).optional(),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);
  const meta = { type: 'body' as const };

  it('returns the parsed value', () => {
    expect(pipe.transform({ quantity: '3' }, meta)).toEqual({ quantity: 3 });
  });

  it('throws a structured Persian error', () => {
    try {
      pipe.transform({ quantity: 0, note: 'خیلی بلند' }, meta);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const body = (error as AppError).getResponse() as {
        code: string;
        details: { fields: Record<string, string> };
      };
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details.fields.quantity).toBe('حداقل تعداد ۱ است');
      expect(body.details.fields.note).toBeTruthy();
    }
  });
});
