import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TransactionType } from '../../transactions/entities/transaction.entity';
import { normalizeCounterparty } from '../parsers/details.parser';
import { CategorizationRule } from './entities/categorization-rule.entity';

export interface LearnedCategory {
  type: TransactionType;
  counterparty: string;
  categoryId: string;
}

@Injectable()
export class CategorizationRulesService {
  constructor(
    @InjectRepository(CategorizationRule)
    private readonly rulesRepository: Repository<CategorizationRule>,
  ) {}

  /** All of the user's rules, keyed by `${type}|${normalizedCounterparty}` (one query). */
  async loadForUser(userId: string): Promise<Map<string, string>> {
    const rules = await this.rulesRepository.find({
      select: { type: true, counterparty: true, categoryId: true },
      where: { userId },
    });
    return new Map(
      rules.map((r) => [ruleKey(r.type, r.counterparty), r.categoryId]),
    );
  }

  /** Saves or overwrites rules from a confirmed import. Latest choice wins. */
  async learn(
    manager: EntityManager,
    userId: string,
    entries: LearnedCategory[],
  ): Promise<void> {
    const byKey = new Map<string, LearnedCategory>();
    for (const entry of entries) {
      const counterparty = normalizeCounterparty(entry.counterparty).slice(0, 120);
      if (!counterparty) continue;
      byKey.set(ruleKey(entry.type, counterparty), { ...entry, counterparty });
    }
    if (byKey.size === 0) return;

    await manager.getRepository(CategorizationRule).upsert(
      [...byKey.values()].map((e) => ({ userId, ...e })),
      ['userId', 'type', 'counterparty'],
    );
  }
}

export function ruleKey(type: TransactionType, counterparty: string) {
  return `${type}|${normalizeCounterparty(counterparty)}`;
}
