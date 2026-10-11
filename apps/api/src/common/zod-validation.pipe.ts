import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { Errors } from './errors';

/**
 * Validates and transforms a handler argument with a Zod schema:
 *   @Body(new ZodBody(createOrderSchema)) body: CreateOrderInput
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
      }
      throw Errors.validation({ fields });
    }
    return result.data;
  }
}

export const ZodBody = ZodValidationPipe;
export const ZodQuery = ZodValidationPipe;
