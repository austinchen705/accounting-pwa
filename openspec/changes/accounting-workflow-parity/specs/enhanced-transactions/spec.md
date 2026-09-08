## ADDED Requirements

### Requirement: Transaction list supports accounting filters
The PWA SHALL filter transactions by month and optionally by type, category, and currency.

#### Scenario: Combine filters
- **WHEN** a user selects a month, expense type, category, and currency
- **THEN** only transactions matching every active filter SHALL be listed

### Requirement: Transaction entry follows the MAUI input flow
The PWA SHALL accept positive decimal amounts and guide keyboard focus from amount to category, date, and note while keeping every control directly accessible.

#### Scenario: Complete entry using the keyboard
- **WHEN** the user advances after entering a valid amount and then selects a category and date
- **THEN** focus SHALL progress through the remaining entry steps without submitting prematurely

### Requirement: Transaction form exposes frequent categories
The PWA SHALL show the most frequently used categories for the current transaction type as directly selectable shortcuts while retaining the full category picker.

#### Scenario: Switch transaction type
- **WHEN** the user changes between expense and income
- **THEN** shortcuts SHALL be recalculated for the selected type and the category selection SHALL remain valid only when it belongs to that type

### Requirement: A transaction supports one local receipt attachment
The PWA SHALL allow image capture or selection, compressed local storage, viewing, replacement, and removal for one receipt per transaction.

#### Scenario: Save a new receipt
- **WHEN** a transaction with a staged image saves successfully
- **THEN** the compressed image SHALL exist in PWA-managed storage and its MAUI-compatible relative path SHALL be stored in `ImageRelativePath`

#### Scenario: Replace or remove a receipt
- **WHEN** an attachment change saves successfully
- **THEN** the old managed file SHALL be removed after the transaction points to the new path or to no path

#### Scenario: Shared path is unavailable locally
- **WHEN** a restored transaction references an image not present in this browser
- **THEN** the PWA SHALL preserve the metadata and explain that the attachment is unavailable on this device
