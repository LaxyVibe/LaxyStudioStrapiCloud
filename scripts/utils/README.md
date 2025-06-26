# Suite Sync Script

This script allows you to fetch all co## What it does

The script will:

1. **Fetch** available suites from the system via API
2. **Display** suites in a user-friendly "name - documentId" format
3. **Fetch** all content from the selected source suite for the specified locale including:
   - Basic fields: name, label, headline, address, addressURL, etc.
   - Rich text fields: checkInOut, amenities, houseRules
   - Media: slider images
   - Components: FAQ items, WiFi details
   - Relations: ownedBy (stay) with all nested data

4. **Transform** the data by removing read-only fields and preparing it for update

5. **Update** the destination suite with all the fetched content for the specified locale

6. **Create localized content** - The script ensures that localized fields (checkInOut, amenities, houseRules, faq) are created in the destination locale even if they don't existrce suite and update a destination suite with that content, supporting different locales. It features both an interactive wizard mode and command-line interface.

## Important Prerequisites

⚠️ **CRITICAL**: Before running the sync script, you MUST manually create the target locale entry for the destination suite in Strapi Admin Panel.

### Steps to Create Locale Entry:
1. **Open Strapi Admin Panel**
2. **Navigate** to Content Manager > Suites
3. **Open** the destination suite you want to sync to
4. **Switch** to the target locale using the locale selector dropdown
5. **Save** the entry (even if empty) to create the locale record

### Why This is Required:
- Strapi's i18n system requires locale entries to exist before they can be updated via API
- The script will **CRASH** if you try to sync to a non-existent locale
- The wizard includes a confirmation step to ensure you've completed this prerequisite

## Usage

### Interactive Wizard (Recommended)

Simply run the script without any arguments to launch the interactive wizard:

```bash
node scripts/utils/sync-suite.js
```

The wizard will guide you through:
1. ⚙️  **Configuring API settings** (Base URL and Bearer Token with smart defaults)
2. 🔍 **Fetching available suites** from the system
3. 📋 **Selecting source suite** from a list showing "name - documentId"
4. 🎯 **Selecting destination suite** from the remaining suites  
5. 🌐 **Selecting locale** from supported options
6. ⚠️ **Confirming locale prerequisite** - Verifying you've created the locale entry
7. ✅ **Confirming the configuration** before proceeding

### Command Line Interface

```bash
node scripts/utils/sync-suite.js <source-documentId> <destination-documentId> [locale]
```

## Examples

```bash
# Interactive wizard (recommended)
node scripts/utils/sync-suite.js

# Command line with default locale (English)
node scripts/utils/sync-suite.js i0n9t1b9ktzszafp237jaqvo j2n8s3c7ltyrbgep348kbrwp

# Command line with specific locale
node scripts/utils/sync-suite.js i0n9t1b9ktzszafp237jaqvo j2n8s3c7ltyrbgep348kbrwp ja
```

## Using npm script

```bash
# Interactive wizard
npm run sync:suite

# With arguments
npm run sync:suite i0n9t1b9ktzszafp237jaqvo j2n8s3c7ltyrbgep348kbrwp ja
```

## Supported Locales

The script supports the following locales:
- **en** - English
- **ja** - Japanese  
- **ko** - Korean
- **zh-Hans** - Chinese (Simplified)
- **zh-Hant** - Chinese (Traditional)

## What it does

The script will:

1. **Fetch** all content from the source suite for the specified locale including:
   - Basic fields: name, label, headline, address, addressURL, etc.
   - Rich text fields: checkInOut, amenities, houseRules
   - Media: slider images
   - Components: FAQ items, WiFi details
   - Relations: ownedBy (stay) with all nested data

2. **Transform** the data by removing read-only fields and preparing it for update

3. **Update** the destination suite with all the fetched content for the specified locale

4. **Create localized content** - The script ensures that localized fields (checkInOut, amenities, houseRules, faq) are created in the destination locale even if they don't exist

## Features

✅ **Interactive Wizard Mode**: User-friendly interface that guides you through the process
✅ **Flexible API Configuration**: Configure Base URL and Bearer Token with smart defaults
✅ **Suite Selection**: Choose from a dropdown list showing "suite-name - documentId" format  
✅ **Comprehensive Data Sync**: Syncs all suite fields including rich text, media, and components
✅ **Multi-locale Support**: Supports 5 locales with proper i18n handling
✅ **Smart Filtering**: Destination suite list excludes the selected source suite
✅ **Localized Content Creation**: Creates missing localized entries for key fields
✅ **Error Handling**: Comprehensive validation and error reporting
✅ **Command Line Interface**: Also supports direct command-line usage
✅ **Progress Tracking**: Detailed console output with progress indicators

## API Integration

The script integrates with your Strapi API:
- **Suites List**: `GET /api/suites` - Fetches all available suites
- **Source Data**: `GET /api/suites/{id}?locale={locale}&populate=...` - Fetches complete suite data
- **Update**: `PUT /api/suites/{id}?locale={locale}` - Updates destination suite

## Locale Support

The script supports Strapi's i18n (internationalization) feature:
- **Default locale**: `en` (English)
- **Supported formats**: `en`, `ja`, `en-US`, `fr-FR`, etc.
- **Localized fields**: label, headline, address, addressURL, checkInOut, amenities, houseRules, faq
- **Non-localized fields**: name (shared across all locales)

## Fields Synchronized

- ✅ name (non-localized)
- ✅ label (localized)
- ✅ headline (localized)
- ✅ address (localized)
- ✅ addressURL (localized)
- ✅ addressEmbedHTML (non-localized)
- ✅ checkInOut (localized TinyMCE content) - **Created if missing**
- ✅ amenities (localized TinyMCE content) - **Created if missing**
- ✅ houseRules (localized TinyMCE content) - **Created if missing**
- ✅ slider (media files, non-localized)
- ✅ faq (localized component array) - **Created if missing**
- ✅ wifi (component array, non-localized)
- ✅ ownedBy (relation to stay, non-localized)

## Configuration

The script uses the following configuration:
- **Base URL**: `http://localhost:1337`
- **Bearer Token**: Pre-configured in the script
- **Default Locale**: `en` (English)
- **Locale Parameter**: Optional third argument to specify target locale

## Error Handling

The script includes comprehensive error handling and will:
- Validate document IDs
- Validate locale format (basic validation)
- Check API responses
- Provide detailed error messages
- Exit with proper status codes

## Output

The script provides detailed console output including:
- Progress indicators with locale information
- Success/error messages
- Sync summary with updated fields and locale
- Timestamp of the operation
- Debug information showing source data structure

## Localization Notes

- **Creating Missing Content**: The script will create localized entries for checkInOut, amenities, houseRules, and faq fields even if they don't exist in the destination locale
- **Locale Validation**: Basic validation ensures locale follows standard format (e.g., "en", "ja", "en-US")
- **API Endpoints**: Both fetch and update operations use the specified locale parameter

## Requirements

- Node.js
- Access to Strapi API
- Valid bearer token
- Valid source and destination document IDs
