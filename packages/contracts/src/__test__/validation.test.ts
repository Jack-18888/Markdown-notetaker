import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import {
  parseContract,
  updateFolderRequestSchema,
  type ValidationFailureHandler,
} from '@markdown-note-taker/contracts';

describe('contract parsing', () => {
  it('accepts unknown input and infers the transformed schema output', () => {
    const schema = z.strictObject({ count: z.string().transform(Number) });
    const input: unknown = { count: '42' };
    const onFailure = vi.fn<ValidationFailureHandler>(() => {
      throw new Error('Invalid contract.');
    });

    const parsed = parseContract(schema, input, onFailure);

    expectTypeOf(parsed).toEqualTypeOf<{ count: number }>();
    expect(parsed).toEqual({ count: 42 });
    expect(input).toEqual({ count: '42' });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('lets the caller classify schema issues and choose the failure', () => {
    const failure = new Error('Choose a valid folder name.');
    const onFailure = vi.fn<ValidationFailureHandler>((issues) => {
      expect(issues).toContainEqual(
        expect.objectContaining({ path: ['name'], code: 'invalid_type' }),
      );
      throw failure;
    });

    expect(() =>
      parseContract(updateFolderRequestSchema, { name: null }, onFailure),
    ).toThrow(failure);
    expect(onFailure).toHaveBeenCalledOnce();
  });
});
