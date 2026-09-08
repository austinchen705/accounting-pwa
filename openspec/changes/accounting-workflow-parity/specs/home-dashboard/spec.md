## ADDED Requirements

### Requirement: Home dashboard is scoped to a selected month
The PWA SHALL let users move backward and forward by calendar month and SHALL refresh all home content for the selected month.

#### Scenario: Navigate to another month
- **WHEN** the user selects the previous or next month control
- **THEN** income, expense, balance, and recent activity SHALL recalculate for that month

### Requirement: Home shows a monthly summary
The PWA SHALL display total income, total expense, and their resulting balance for the selected month.

#### Scenario: Summarize mixed activity
- **WHEN** the selected month contains income and expense transactions
- **THEN** the dashboard SHALL show each total and balance equal to income minus expense

### Requirement: Home shows recent monthly transactions
The PWA SHALL show at most ten transactions from the selected month ordered newest first.

#### Scenario: Selected month is empty
- **WHEN** no transactions fall within the selected month
- **THEN** the dashboard SHALL show a clear empty state instead of stale activity
