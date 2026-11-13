import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AccountType } from '../entities/account.entity';
import { CreateAccountDto } from './create-account.dto';
import { UpdateAccountDto } from './update-account.dto';

// Mirrors the global ValidationPipe in main.ts ({ whitelist: true, transform: true }).
async function validateDto<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
) {
  const instance = plainToInstance(cls, body);
  const errors = await validate(instance, { whitelist: true });
  return { instance, errors };
}

describe('CreateAccountDto', () => {
  const valid = { name: 'ABA', type: AccountType.BANK, currency: 'USD' };

  it('accepts a valid payload', async () => {
    const { errors } = await validateDto(CreateAccountDto, valid);
    expect(errors).toHaveLength(0);
  });

  it('normalizes currency to upper case', async () => {
    const { instance, errors } = await validateDto(CreateAccountDto, {
      ...valid,
      currency: ' khr ',
    });
    expect(errors).toHaveLength(0);
    expect(instance.currency).toBe('KHR');
  });

  it('rejects an unknown currency code', async () => {
    const { errors } = await validateDto(CreateAccountDto, {
      ...valid,
      currency: 'XYZ',
    });
    expect(errors.map((e) => e.property)).toContain('currency');
  });

  it('rejects an unknown account type', async () => {
    const { errors } = await validateDto(CreateAccountDto, {
      ...valid,
      type: 'crypto',
    });
    expect(errors.map((e) => e.property)).toContain('type');
  });

  it('trims the name and rejects a blank one', async () => {
    const { errors } = await validateDto(CreateAccountDto, {
      ...valid,
      name: '   ',
    });
    expect(errors.map((e) => e.property)).toContain('name');
  });

  it('rejects a name longer than 100 characters', async () => {
    const { errors } = await validateDto(CreateAccountDto, {
      ...valid,
      name: 'a'.repeat(101),
    });
    expect(errors.map((e) => e.property)).toContain('name');
  });

  it('rejects openingBalance with more than 2 decimals', async () => {
    const { errors } = await validateDto(CreateAccountDto, {
      ...valid,
      openingBalance: 1.234,
    });
    expect(errors.map((e) => e.property)).toContain('openingBalance');
  });

  it('accepts a negative openingBalance', async () => {
    const { errors } = await validateDto(CreateAccountDto, {
      ...valid,
      openingBalance: -50,
    });
    expect(errors).toHaveLength(0);
  });
});

describe('UpdateAccountDto', () => {
  it('allows an empty (partial) payload', async () => {
    const { errors } = await validateDto(UpdateAccountDto, {});
    expect(errors).toHaveLength(0);
  });

  it('strips currency so it can never be updated', async () => {
    const { instance } = await validateDto(UpdateAccountDto, {
      currency: 'KHR',
    });
    expect((instance as Record<string, unknown>).currency).toBeUndefined();
  });
});
