## ADDED Requirements

### Requirement: Users manage income and expense categories
The PWA SHALL allow creation, editing, listing, and type filtering of categories while preserving MAUI-compatible names, icons, and type values.

#### Scenario: Create a valid category
- **WHEN** a user enters a non-empty name, supported icon, and income or expense type
- **THEN** the category SHALL become available in matching transaction and budget forms

### Requirement: Category identity is validated
The PWA SHALL reject a duplicate category name within the same type while allowing the same name in the other type.

#### Scenario: Rename to an existing same-type name
- **WHEN** an edit would duplicate another category name of the same type
- **THEN** the save SHALL fail with a useful validation message and preserve both existing rows

### Requirement: Referenced categories cannot be deleted
The PWA SHALL prevent deletion of a category referenced by transactions or budgets.

#### Scenario: Delete an in-use category
- **WHEN** the category has at least one transaction or budget reference
- **THEN** no data SHALL be deleted and the user SHALL be told why
