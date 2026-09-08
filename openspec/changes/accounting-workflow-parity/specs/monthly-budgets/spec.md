## ADDED Requirements

### Requirement: Budgets are managed per category and month
The PWA SHALL let users create, update, and delete one positive budget amount for each expense category in a selected `yyyy-MM` month.

#### Scenario: Save an existing category budget
- **WHEN** a budget already exists for the selected category and month
- **THEN** saving SHALL update that row instead of creating a duplicate

### Requirement: Budget progress reflects monthly spending
The PWA SHALL compare each budget with expense spending for the same category and month.

#### Scenario: Spending exceeds budget
- **WHEN** qualifying spending is greater than the budget amount
- **THEN** the PWA SHALL display the actual ratio and an over-budget state without capping the numeric result

### Requirement: Budget month navigation is independent
The PWA SHALL allow budget month navigation without changing another screen's selected month.

#### Scenario: Open budgets after using Home
- **WHEN** the user changes the budget month
- **THEN** the Home and Transactions month selections SHALL remain unchanged
