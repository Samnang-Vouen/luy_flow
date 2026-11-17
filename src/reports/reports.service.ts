import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { ReportQueryDto } from './dto/report-query.dto';

export interface TotalsRow {
  currency: string;
  income: string;
  expenses: string;
  transactionCount: string;
}

export function totals(row: TotalsRow) {
  const income = new Decimal(row.income);
  const expenses = new Decimal(row.expenses);
  return {
    currency: row.currency,
    income: income.toFixed(2),
    expenses: expenses.toFixed(2),
    surplus: income.minus(expenses).toFixed(2),
    savingsRate: income.gt(0)
      ? income.minus(expenses).div(income).mul(100).toFixed(2)
      : null,
    transactionCount: Number(row.transactionCount),
  };
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  private filtered(userId: string, query: ReportQueryDto) {
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }
    const qb = this.transactions
      .createQueryBuilder('t')
      .where('t.userId = :userId', { userId });
    if (query.dateFrom)
      qb.andWhere('t.date >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere('t.date <= :dateTo', { dateTo: query.dateTo });
    if (query.accountId)
      qb.andWhere('t.accountId = :accountId', { accountId: query.accountId });
    if (query.currency)
      qb.andWhere('t.currency = :currency', { currency: query.currency });
    return qb;
  }

  private aggregate(userId: string, query: ReportQueryDto) {
    return this.filtered(userId, query)
      .select('t.currency', 'currency')
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)`,
        'income',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)`,
        'expenses',
      )
      .addSelect('COUNT(*)', 'transactionCount');
  }

  async summary(userId: string, query: ReportQueryDto) {
    const rows = await this.aggregate(userId, query)
      .groupBy('t.currency')
      .orderBy('t.currency', 'ASC')
      .getRawMany<TotalsRow>();
    return { data: rows.map(totals) };
  }

  async byCategory(userId: string, query: ReportQueryDto) {
    const data = await this.filtered(userId, query)
      .leftJoin('t.category', 'c')
      .select('t.currency', 'currency')
      .addSelect('t.type', 'type')
      .addSelect('t.categoryId', 'categoryId')
      .addSelect(`COALESCE(c.name, 'Uncategorized')`, 'categoryName')
      .addSelect('SUM(t.amount)', 'amount')
      .addSelect('COUNT(*)', 'transactionCount')
      .groupBy('t.currency')
      .addGroupBy('t.type')
      .addGroupBy('t.categoryId')
      .addGroupBy('c.name')
      .orderBy('t.currency', 'ASC')
      .addOrderBy('SUM(t.amount)', 'DESC')
      .addOrderBy('t.categoryId', 'ASC')
      .getRawMany<{
        currency: string;
        type: string;
        categoryId: string | null;
        categoryName: string;
        amount: string;
        transactionCount: string;
      }>();
    return {
      data: data.map((row) => ({
        ...row,
        amount: new Decimal(row.amount).toFixed(2),
        transactionCount: Number(row.transactionCount),
      })),
    };
  }

  async trends(userId: string, query: ReportQueryDto) {
    // Only these fixed SQL expressions can reach SELECT/GROUP BY.
    const periods = {
      day: `to_char(t.date, 'YYYY-MM-DD')`,
      week: `to_char(date_trunc('week', t.date), 'YYYY-MM-DD')`,
      month: `to_char(t.date, 'YYYY-MM')`,
      year: `to_char(t.date, 'YYYY')`,
    };
    const period = periods[query.groupBy ?? 'month'];
    if (!period) throw new BadRequestException('Invalid groupBy');
    const rows = await this.aggregate(userId, query)
      .addSelect(period, 'period')
      .groupBy('t.currency')
      .addGroupBy(period)
      .orderBy('period', 'ASC')
      .addOrderBy('t.currency', 'ASC')
      .getRawMany<TotalsRow & { period: string }>();
    return {
      groupBy: query.groupBy ?? 'month',
      data: rows.map((row) => ({ period: row.period, ...totals(row) })),
    };
  }
}
