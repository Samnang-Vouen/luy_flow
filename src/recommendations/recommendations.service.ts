import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { BudgetsService, monthRange } from '../budgets/budgets.service';
import { ReportsService } from '../reports/reports.service';

export interface Recommendation {
  code: string;
  currency: string;
  severity: 'info' | 'warning';
  message: string;
  amount?: string;
  budgetId?: string;
  categoryId?: string | null;
  baselineMonth?: string;
  baselineAmount?: string;
  increasePercentage?: string;
}

// A simple, explainable signal: selected-month category expenses are at least
// 50% higher than the previous calendar month, in the same currency.
const UNUSUAL_SPENDING_MULTIPLIER = new Decimal('1.5');

function previousMonth(month: string): string | null {
  const [year, number] = month.split('-').map(Number);
  if (year === 1 && number === 1) return null;
  return number === 1
    ? `${String(year - 1).padStart(4, '0')}-12`
    : `${String(year).padStart(4, '0')}-${String(number - 1).padStart(2, '0')}`;
}

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly reports: ReportsService,
    private readonly budgets: BudgetsService,
  ) {}

  async findAll(userId: string, month: string) {
    const range = monthRange(month);
    const [summary, progress] = await Promise.all([
      this.reports.summary(userId, { ...range, groupBy: 'month' }),
      this.budgets.monthlyProgress(userId, month),
    ]);
    const recommendations: Recommendation[] = [];
    for (const row of summary.data) {
      const income = new Decimal(row.income);
      const surplus = new Decimal(row.surplus);
      if (surplus.lt(0)) {
        recommendations.push({
          code: 'SPENDING_EXCEEDS_INCOME',
          currency: row.currency,
          severity: 'warning',
          amount: surplus.abs().toFixed(2),
          message: `Recorded spending exceeds income by ${surplus.abs().toFixed(2)} ${row.currency}. Review expenses or record missing income.`,
        });
      } else if (income.gt(0) && surplus.gt(0)) {
        const suggested = Decimal.min(income.mul('0.2'), surplus);
        recommendations.push({
          code: 'SAVINGS_OPPORTUNITY',
          currency: row.currency,
          severity: 'info',
          amount: suggested.toFixed(2),
          message: `Consider setting aside up to ${suggested.toFixed(2)} ${row.currency}, capped at 20% of recorded income and the recorded surplus.`,
        });
      }
      if (
        !progress.some(
          (budget) =>
            budget.currency === row.currency && budget.categoryId === null,
        )
      ) {
        recommendations.push({
          code: 'SET_MONTHLY_BUDGET',
          currency: row.currency,
          severity: 'info',
          message: `Set an overall ${row.currency} budget to track monthly spending.`,
        });
      }
    }
    for (const budget of progress) {
      if (budget.status === 'on_track') continue;
      recommendations.push({
        code:
          budget.status === 'exceeded' ? 'BUDGET_REACHED' : 'BUDGET_NEAR_LIMIT',
        currency: budget.currency,
        severity: 'warning',
        budgetId: budget.id,
        message: `${budget.categoryId ? 'Category' : 'Overall'} budget has used ${budget.percentageUsed}% of its ${budget.amount} ${budget.currency} limit.`,
      });
    }
    const baselineMonth = previousMonth(month);
    if (baselineMonth) {
      const [currentCategories, previousCategories] = await Promise.all([
        this.reports.byCategory(userId, { ...range, groupBy: 'month' }),
        this.reports.byCategory(userId, {
          ...monthRange(baselineMonth),
          groupBy: 'month',
        }),
      ]);
      const baseline = new Map(
        previousCategories.data
          .filter((row) => row.type === 'expense')
          .map((row) => [
            JSON.stringify([row.currency, row.categoryId]),
            new Decimal(row.amount),
          ]),
      );
      for (const row of currentCategories.data) {
        if (row.type !== 'expense') continue;
        const previous = baseline.get(
          JSON.stringify([row.currency, row.categoryId]),
        );
        const current = new Decimal(row.amount);
        // New categories and zero baselines cannot establish an increase rate.
        if (
          !previous ||
          !previous.gt(0) ||
          current.lt(previous.mul(UNUSUAL_SPENDING_MULTIPLIER))
        )
          continue;
        const increasePercentage = current
          .minus(previous)
          .div(previous)
          .mul(100)
          .toFixed(2);
        recommendations.push({
          code: 'UNUSUAL_CATEGORY_SPENDING',
          currency: row.currency,
          severity: 'warning',
          categoryId: row.categoryId,
          amount: current.toFixed(2),
          baselineMonth,
          baselineAmount: previous.toFixed(2),
          increasePercentage,
          message: `Recorded ${row.categoryName} spending is ${current.toFixed(2)} ${row.currency}, ${increasePercentage}% above ${baselineMonth} (${previous.toFixed(2)} ${row.currency}). Review this increase.`,
        });
      }
    }
    return {
      month,
      basis:
        'Recorded transactions only; currencies are evaluated separately. Savings suggestions use a fixed 20% rule, not a forecast. Unusual spending means category expenses at least 50% above the previous calendar month with a positive baseline. Partial months are not extrapolated; missing history produces no unusual-spending alert.',
      hasTransactions: summary.data.length > 0,
      recommendations,
    };
  }
}
