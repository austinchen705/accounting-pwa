## ADDED Requirements

### Requirement: Primary accounting destinations remain reachable on mobile
The PWA SHALL provide persistent access to Home, Transactions, Statistics, Category Report, and More using safe-area-aware controls with touch targets of at least 44 CSS pixels.

#### Scenario: Navigate between primary destinations
- **WHEN** the user selects a primary destination
- **THEN** its view SHALL become active, its data SHALL refresh when needed, and the active destination SHALL be visibly identified

### Requirement: More exposes secondary workflows
The PWA SHALL link Budgets, Categories, Asset Trend, and Settings from a More destination.

#### Scenario: Return from a secondary workflow
- **WHEN** the user uses the secondary view's back control
- **THEN** the PWA SHALL return to More unless the view was opened from a contextual workflow

### Requirement: Detail navigation preserves context
Forms, report drill-down, receipt viewing, and expanded charts SHALL return users to the state from which they were opened.

#### Scenario: Return from category report detail
- **WHEN** the user closes a category transaction drill-down
- **THEN** the report range, period, and chart selection SHALL remain unchanged
