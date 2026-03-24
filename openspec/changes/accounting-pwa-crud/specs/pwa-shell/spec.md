## ADDED Requirements

### Requirement: PWA installable on iPhone Safari
The system SHALL be installable on iPhone via Safari "Add to Home Screen" and launch in standalone mode (no browser chrome).

#### Scenario: Add to Home Screen
- **WHEN** the user visits the GitHub Pages URL in Safari and taps "Add to Home Screen"
- **THEN** the app is installed with the correct name, icon, and launches in standalone mode

#### Scenario: Standalone launch
- **WHEN** the user opens the installed PWA from the iPhone Home Screen
- **THEN** the app opens without Safari's address bar or navigation UI

### Requirement: Offline capability after first load
The system SHALL work fully offline after the first successful page load. All app assets including sql.js WebAssembly binary SHALL be cached by the service worker.

#### Scenario: Offline use after first load
- **WHEN** the user opens the PWA without an internet connection after having loaded it at least once
- **THEN** the app loads normally and all local data is accessible (backup/restore will fail gracefully)

#### Scenario: Cache-first asset serving
- **WHEN** a cached asset is requested
- **THEN** the service worker serves it from cache without hitting the network

#### Scenario: Google API requests bypass cache
- **WHEN** a request is made to `googleapis.com` or `accounts.google.com`
- **THEN** the service worker does not intercept it — the request goes directly to the network

### Requirement: Local database persistence between sessions
The system SHALL persist the loaded SQLite database to OPFS after every mutation so data survives page reload and app restart.

#### Scenario: Data survives reload
- **WHEN** the user adds a transaction and then closes and reopens the PWA
- **THEN** the transaction list still shows the previously added transaction

#### Scenario: OPFS fallback to localStorage
- **WHEN** OPFS (`navigator.storage.getDirectory`) is not available in the browser
- **THEN** the system falls back to storing base64-encoded DB bytes in localStorage

#### Scenario: DB loaded from OPFS on startup
- **WHEN** the app starts and a persisted DB exists in OPFS
- **THEN** the DB is loaded from OPFS automatically without requiring a Drive restore

### Requirement: Mobile-optimized UI
The system SHALL render a mobile-first interface with touch-friendly tap targets (minimum 44px), proper safe-area inset padding for iPhone notch/home indicator, and a fixed action button (FAB) to add new transactions.

#### Scenario: Tap targets meet minimum size
- **WHEN** the user views any interactive element (buttons, list rows, icons)
- **THEN** each element has a minimum tap target area of 44×44px

#### Scenario: Safe area padding applied
- **WHEN** the app is viewed on an iPhone with a notch or home indicator
- **THEN** content is not obscured by the notch or home indicator (uses `env(safe-area-inset-*)`)

### Requirement: Toast notifications for async operations
The system SHALL display non-blocking toast messages for the outcome of all async operations (backup, restore, errors).

#### Scenario: Success toast auto-dismisses
- **WHEN** an async operation completes successfully
- **THEN** a toast message appears and auto-dismisses after 3 seconds

#### Scenario: Error toast displayed
- **WHEN** an async operation fails
- **THEN** a toast with the error message is shown
