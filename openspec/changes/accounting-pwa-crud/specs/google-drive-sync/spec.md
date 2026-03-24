## ADDED Requirements

### Requirement: Google Drive OAuth2 authentication
The system SHALL authenticate users with Google via OAuth2 PKCE flow using a full-page redirect. No client secret SHALL be required.

#### Scenario: User connects Google Drive
- **WHEN** the user taps "Connect Google Drive" in the Settings view
- **THEN** the app redirects to Google's OAuth consent screen with PKCE parameters

#### Scenario: OAuth callback handled on return
- **WHEN** the page loads with `?code=` and `?state=` query parameters
- **THEN** the app exchanges the code for tokens, stores them in localStorage, removes query params from the URL with `history.replaceState`, and shows the Settings view in authenticated state

#### Scenario: State mismatch on callback
- **WHEN** the `state` parameter in the callback does not match the value stored in sessionStorage
- **THEN** authentication is rejected, tokens are not stored, and a toast "Authentication failed. Please try again." is shown

#### Scenario: Token auto-refresh
- **WHEN** the access token is within 60 seconds of expiry and a Drive operation is requested
- **THEN** the system transparently refreshes the access token using the stored refresh token before proceeding

#### Scenario: Refresh token failure
- **WHEN** the token refresh request fails (e.g., token revoked)
- **THEN** stored tokens are cleared and the user is prompted to reconnect Google Drive

### Requirement: Backup database to Google Drive
The system SHALL upload the current in-memory SQLite database as `accounting_backup.db` to the `personaccount_backup` folder in Google Drive.

#### Scenario: Successful backup
- **WHEN** the user taps "Backup to Drive" and is authenticated
- **THEN** the app exports the sql.js database to bytes, uploads to Google Drive (updating the existing file or creating it if absent), and shows a success toast "Backup complete"

#### Scenario: Backup updates existing file
- **WHEN** `accounting_backup.db` already exists in `personaccount_backup` on Google Drive
- **THEN** the file is updated (PATCH) rather than creating a duplicate

#### Scenario: Backup creates file if absent
- **WHEN** `accounting_backup.db` does not exist in `personaccount_backup` on Google Drive
- **THEN** a new file is created (POST multipart upload)

#### Scenario: Backup while unauthenticated
- **WHEN** the user taps "Backup to Drive" but is not authenticated
- **THEN** the OAuth flow is triggered before proceeding with the backup

#### Scenario: Drive API error during backup
- **WHEN** the Drive API returns a non-2xx response during upload
- **THEN** a toast "Drive sync failed. Data is saved locally." is shown and the local DB is unchanged

### Requirement: Restore database from Google Drive
The system SHALL download `accounting_backup.db` from the `personaccount_backup` folder and replace the current local database.

#### Scenario: Successful restore
- **WHEN** the user taps "Restore from Drive" and the backup file exists
- **THEN** the file is downloaded, loaded into sql.js, persisted to OPFS, and the transaction list is refreshed

#### Scenario: Backup file not found
- **WHEN** `accounting_backup.db` does not exist in `personaccount_backup` on Google Drive
- **THEN** a toast "No backup found in Google Drive." is shown and the local DB is unchanged

#### Scenario: Corrupt backup file
- **WHEN** the downloaded file cannot be parsed as a valid SQLite database
- **THEN** a toast "Backup file appears corrupt." is shown and the local database is NOT overwritten
