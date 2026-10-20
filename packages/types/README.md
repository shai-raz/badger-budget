# @badger/types

Shared TypeScript types for the Badger Budget application.

## Overview

This package contains all shared type definitions used across the mobile app and backend API, ensuring type safety and consistency throughout the application.

## Type Categories

### User & Authentication

- `User` - User account information

### Budget Management

- `Budget` - Budget entity
- `CreateBudgetDto` - Create budget request
- `UpdateBudgetDto` - Update budget request
- `BudgetPeriodBoundaryRules` - Canonical local-time period boundary rules
- `BudgetFxConversionRules` - Canonical FX conversion rules for budget spend

### Categories

- `Category` - Transaction category
- `CreateCategoryDto` - Create category request
- `UpdateCategoryDto` - Update category request

### Transactions

- `Transaction` - Financial transaction
- `TransactionType` - Type of transaction (income/expense)
- `CreateTransactionDto` - Create transaction request
- `UpdateTransactionDto` - Update transaction request

### Analytics & Reports

- `BudgetSummary` - Budget overview statistics
- `CategorySummary` - Category spending breakdown
- `PeriodSummary` - Time-based financial summary

### API Responses

- `ApiResponse<T>` - Standard API response wrapper
- `PaginatedResponse<T>` - Paginated list response
- `ApiError` - Error response structure

## Usage

```typescript
import type { Budget, CreateBudgetDto, Transaction } from "@badger/types";

const newBudget: CreateBudgetDto = {
    name: "Monthly Groceries",
    amount: 500,
    currencyId: "currency-usd-uuid",
    period: "monthly",
    categoryIds: ["category-groceries-uuid"],
};
```

## Canonical Budget Contract Notes

- A budget canonically contains `name`, `amount`, `currencyId`, `period`, and `categoryIds[]` (minimum 1 category).
- Lifecycle fields are optional (`startDate`, `endDate`, `deletedAt`).
- Budget spend is calculated from **expense** transactions whose categories overlap with `categoryIds`.
- Overlap across budgets is allowed and expected.
- Spend rollups are evaluated within the current budget period in the **user timezone**.
- FX conversion uses historical rates for historical transactions and respects stored FX snapshots when present.

## Development

This is a TypeScript-only package with no runtime code. It's used at compile time for type checking across the monorepo.
