# ERD: Savings Goals, Debts, Groups

Paste the Mermaid block into https://mermaid.live or any Mermaid viewer.

```mermaid
erDiagram
    users ||--o{ savings_goals : owns
    savings_goals ||--o{ savings_goal_contributions : has
    users ||--o{ savings_goal_contributions : makes

    users ||--o{ debts : owns
    debts ||--o{ debt_payments : has
    users ||--o{ debt_payments : makes

    users ||--o{ groups : owns
    groups ||--o{ group_members : has
    users ||--o{ group_members : joins
    groups ||--o{ group_contributions : has
    users ||--o{ group_contributions : makes

    savings_goals {
        uuid id PK
        uuid userId FK
        varchar name
        numeric targetAmount
        numeric currentAmount
        date targetDate "nullable"
        enum status "active|completed|cancelled"
        timestamp createdAt
        timestamp updatedAt
    }
    savings_goal_contributions {
        uuid id PK
        uuid goalId FK
        uuid userId FK
        numeric amount
        varchar note "nullable"
        uuid accountId "nullable, no FK yet"
        timestamp createdAt
    }
    debts {
        uuid id PK
        uuid userId FK
        varchar counterparty
        enum direction "owed_by_me|owed_to_me"
        numeric principalAmount
        numeric remainingAmount
        numeric interestRate "nullable"
        date dueDate "nullable"
        text notes "nullable"
        enum status "active|paid"
        timestamp createdAt
        timestamp updatedAt
    }
    debt_payments {
        uuid id PK
        uuid debtId FK
        uuid userId FK
        numeric amount
        date paidAt
        varchar note "nullable"
        uuid accountId "nullable, no FK yet"
        timestamp createdAt
    }
    groups {
        uuid id PK
        uuid ownerId FK
        varchar name
        varchar description "nullable"
        numeric targetAmount "nullable"
        numeric currentAmount
        timestamp createdAt
        timestamp updatedAt
    }
    group_members {
        uuid id PK
        uuid groupId FK
        uuid userId FK
        enum role "owner|member"
        timestamp joinedAt
    }
    group_contributions {
        uuid id PK
        uuid groupId FK
        uuid userId FK
        numeric amount
        varchar note "nullable"
        timestamp createdAt
    }
```

## Constraints
- `group_members`: unique on (`groupId`, `userId`).
- Money columns are `numeric(12,2)`; `interestRate` is `numeric(5,2)`.
- `amount`, `targetAmount`, `principalAmount` have `CHECK > 0`; `currentAmount`, `remainingAmount` have `CHECK >= 0`.
- FKs to `users` and parent tables use `ON DELETE CASCADE`.
- Indexes: `savings_goals(userId)`, `debts(userId)`, `group_members(userId)`, plus `goalId` / `debtId` / `groupId` on the child tables.
