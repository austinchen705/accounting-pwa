## ADDED Requirements

### Requirement: Asset snapshot entry can prefill the latest values
The PWA SHALL let users copy all asset amounts from the latest snapshot into a new snapshot draft without copying its date.

#### Scenario: Prefill a new snapshot
- **WHEN** history exists and the user requests latest-value prefill
- **THEN** stock, cash, FirstTrade, and property SHALL copy from the newest snapshot while the draft date remains selected independently

### Requirement: FirstTrade accepts USD entry with TWD preview
The PWA SHALL support entering a FirstTrade USD amount, obtaining or reusing a cached USD-to-TWD rate, previewing the converted amount, and saving TWD in the shared snapshot column.

#### Scenario: Exchange-rate lookup is unavailable
- **WHEN** no usable live or cached rate exists
- **THEN** the PWA SHALL explain the problem and SHALL NOT silently save the USD amount as TWD

### Requirement: Asset history supports CSV import
The PWA SHALL parse MAUI-compatible asset CSV rows, report imported and skipped rows, and allow append/upsert or explicit replacement of snapshot history.

#### Scenario: Import a partly invalid file
- **WHEN** a CSV contains valid and invalid rows
- **THEN** valid rows SHALL be imported and invalid rows SHALL be counted with actionable error details

### Requirement: Asset trend matches current MAUI presentation behavior
The PWA SHALL show newest-first history, latest total, liquid-assets total, condensed labels, and a separately accessible expanded chart.

#### Scenario: Open expanded chart
- **WHEN** the user selects the chart expansion control
- **THEN** a larger responsive chart SHALL open and returning SHALL preserve the asset view state
