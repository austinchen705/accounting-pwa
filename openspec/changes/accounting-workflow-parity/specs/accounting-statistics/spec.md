## ADDED Requirements

### Requirement: Statistics show a rolling twelve-month trend
The PWA SHALL chart monthly income, expense, and balance over the twelve calendar months ending at the selected anchor month.

#### Scenario: Move the statistics window
- **WHEN** the user moves the anchor month backward or forward
- **THEN** labels, values, and insights SHALL refresh for the corresponding twelve-month window

### Requirement: Statistics show expense category trends
The PWA SHALL chart top expense categories across the visible twelve-month window and allow selection of a single expense category.

#### Scenario: Select one category
- **WHEN** the user chooses an expense category filter
- **THEN** the category chart SHALL show only that category across the same month window

### Requirement: Statistics provide trend insights
The PWA SHALL summarize latest-month change, average income, average expense, and the dominant expense category from visible data.

#### Scenario: Insufficient comparison data
- **WHEN** fewer than two populated comparison months are available
- **THEN** the PWA SHALL omit or clearly mark change insights that cannot be calculated

### Requirement: Statistics axes scale to visible values
Both statistics charts SHALL derive readable Y-axis steps from their own visible value ranges.

#### Scenario: Render small values
- **WHEN** visible values are far below 50,000
- **THEN** the chart SHALL use smaller intermediate steps rather than a fixed 50,000 step
