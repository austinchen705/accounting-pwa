## ADDED Requirements

### Requirement: PWA database remains compatible with the MAUI schema
The PWA SHALL preserve the MAUI table names, column names, value representations, and primary keys for shared accounting data.

#### Scenario: Open a MAUI database
- **WHEN** the PWA loads an `accounting_backup.db` created by the MAUI app
- **THEN** existing transactions, categories, budgets, exchange-rate cache entries, and asset snapshots SHALL remain readable without conversion loss

### Requirement: Schema upgrades are additive and idempotent
The PWA SHALL create missing MAUI tables, columns, and indexes without replacing existing rows, and SHALL safely repeat migrations after every local load and Drive restore.

#### Scenario: Upgrade an older PWA database
- **WHEN** a database lacks budgets, exchange-rate cache, or transaction attachment metadata
- **THEN** the PWA SHALL add the missing schema objects and retain all existing accounting records

#### Scenario: Repeat migrations
- **WHEN** an already upgraded database is loaded again
- **THEN** migration SHALL complete without duplicate objects or changed user data

### Requirement: Shared dates use .NET ticks
The PWA MUST store shared transaction, snapshot, and exchange-cache dates as .NET tick integers expected by SQLite-Net.

#### Scenario: Write and reread a date
- **WHEN** the PWA saves a dated shared record and exports the database
- **THEN** the raw date column SHALL contain .NET ticks and both applications SHALL resolve the same calendar or UTC value

### Requirement: Every mutation persists offline state
The PWA SHALL export the database to its local persistence provider after every successful mutation.

#### Scenario: Reload after editing
- **WHEN** a user changes accounting data and reloads the PWA while offline
- **THEN** the latest successful change SHALL still be present
