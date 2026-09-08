## ADDED Requirements

### Requirement: Expense report supports fixed time ranges
The PWA SHALL offer week, month, year, and all-time expense ranges with previous and next navigation for bounded ranges.

#### Scenario: Change range or period
- **WHEN** the user changes the range or navigates a bounded period
- **THEN** the period label, totals, chart, ranking, and drill-down context SHALL update together

### Requirement: Expense report summarizes expense categories only
The PWA SHALL aggregate expense transactions by category and exclude income transactions.

#### Scenario: Display a populated report
- **WHEN** qualifying expenses exist
- **THEN** the PWA SHALL show total expense, a category donut chart, and a ranked list with amount and percentage

#### Scenario: Display an empty report
- **WHEN** no qualifying expenses exist
- **THEN** the PWA SHALL show an empty state and SHALL NOT render misleading chart segments

### Requirement: Category rows open transaction drill-down
The PWA SHALL let users inspect the transactions contributing to a category total, grouped by date and ordered newest first.

#### Scenario: Return from drill-down
- **WHEN** the user returns to the report
- **THEN** the previously selected range and anchor period SHALL be preserved
