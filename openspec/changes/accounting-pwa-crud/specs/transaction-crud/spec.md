## ADDED Requirements

### Requirement: List transactions by month
The system SHALL display all transactions for the currently selected month, ordered by date descending. Each row SHALL show amount, currency, category icon, category name, date, note, and type (income/expense).

#### Scenario: Default view shows current month
- **WHEN** the user opens the app
- **THEN** the transaction list displays all transactions for the current calendar month

#### Scenario: User navigates to a different month
- **WHEN** the user taps the previous or next month arrow
- **THEN** the list updates to show transactions for that month

#### Scenario: No transactions in selected month
- **WHEN** the selected month has no transactions
- **THEN** the list shows an empty state message ("No transactions this month")

### Requirement: Filter transactions by type
The system SHALL allow filtering the transaction list to show "all", "income only", or "expense only".

#### Scenario: Filter by income
- **WHEN** the user selects the "Income" filter
- **THEN** only transactions with type "income" are shown for the selected month

#### Scenario: Filter by expense
- **WHEN** the user selects the "Expense" filter
- **THEN** only transactions with type "expense" are shown for the selected month

### Requirement: Add a transaction
The system SHALL allow the user to create a new transaction with amount, currency, category, date, note, and type.

#### Scenario: Successful add
- **WHEN** the user fills in a valid amount, selects a category, selects a type, and submits the form
- **THEN** the transaction is saved to the local SQLite database, the DB is persisted to OPFS, and the user is returned to the transaction list showing the new entry

#### Scenario: Amount validation
- **WHEN** the user submits the form with an empty or zero amount
- **THEN** an inline error "Amount is required" is shown and the form is not submitted

#### Scenario: Category required
- **WHEN** the user submits the form without selecting a category
- **THEN** an inline error "Please select a category" is shown and the form is not submitted

#### Scenario: Default date is today
- **WHEN** the add form opens
- **THEN** the date field defaults to today's date

#### Scenario: Currency defaults to TWD
- **WHEN** the add form opens
- **THEN** the currency field defaults to "TWD"

### Requirement: Edit a transaction
The system SHALL allow the user to modify an existing transaction's amount, currency, category, date, note, and type.

#### Scenario: Open edit form
- **WHEN** the user taps the edit icon on a transaction row
- **THEN** the edit form opens pre-populated with that transaction's current values

#### Scenario: Successful edit
- **WHEN** the user modifies fields and submits the edit form
- **THEN** the transaction is updated in the local SQLite database, the DB is persisted to OPFS, and the list reflects the change

### Requirement: Delete a transaction
The system SHALL allow the user to permanently delete a transaction from the edit form, with a confirmation step.

#### Scenario: Delete with confirmation
- **WHEN** the user taps "Delete" on the edit form and confirms the action
- **THEN** the transaction is removed from the SQLite database, the DB is persisted to OPFS, and the user is returned to the transaction list

#### Scenario: Cancel delete
- **WHEN** the user taps "Delete" but then cancels the confirmation
- **THEN** the transaction is not deleted and the edit form remains open

### Requirement: Category dropdown populated from DB
The system SHALL populate the category dropdown in add/edit forms using the Categories table from the loaded SQLite database. Categories SHALL be filtered to match the selected transaction type.

#### Scenario: Categories filtered by type
- **WHEN** the user selects "income" as the transaction type
- **THEN** the category dropdown shows only categories with type "income"

#### Scenario: Categories loaded from DB
- **WHEN** the add or edit form opens
- **THEN** the category list reflects the Categories table in the currently loaded SQLite database
