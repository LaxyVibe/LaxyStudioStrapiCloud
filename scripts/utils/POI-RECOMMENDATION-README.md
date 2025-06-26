# POI Recommendation Sync Script

This script helps you sync POI references from English locale to other locales for poi-recommendations. It fetches the POI reference from the English version and updates the target locale with the same POI reference.

## Important Prerequisites

⚠️ **CRITICAL**: Before running the sync script, you MUST manually create the target locale entry for the POI recommendation in Strapi Admin Panel.

### Steps to Create Locale Entry:
1. **Open Strapi Admin Panel**
2. **Navigate** to Content Manager > POI Recommendations
3. **Open** the POI recommendation you want to sync to
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
node scripts/utils/sync-poi-recommendation.js
```

The wizard will guide you through:
1. ⚙️  **Configuring API settings** (Base URL and Bearer Token with smart defaults)
2. 🔍 **Fetching available POI recommendations** from the system
3. 📍 **Selecting POI recommendation** from a list showing recommendation text and documentId
4. 🌐 **Selecting target locale** (English is always used as source)
5. ⚠️ **Confirming locale prerequisite** - Verifying you've created the locale entry
6. ✅ **Confirming the configuration** before proceeding

### Command Line Interface

```bash
node scripts/utils/sync-poi-recommendation.js <poi-recommendation-documentId> <target-locale>
```

## Examples

```bash
# Interactive wizard (recommended)
node scripts/utils/sync-poi-recommendation.js

# Command line with specific POI recommendation and target locale
node scripts/utils/sync-poi-recommendation.js ggdg58lya8zch2xrc1ub65t5 zh-Hant
node scripts/utils/sync-poi-recommendation.js ggdg58lya8zch2xrc1ub65t5 ja
```

## Using npm script

```bash
# Interactive wizard
npm run sync:poi-recommendation

# With arguments
npm run sync:poi-recommendation ggdg58lya8zch2xrc1ub65t5 zh-Hant
```

## Supported Locales

The script supports the following target locales (English is always used as source):
- **ja** - Japanese  
- **ko** - Korean
- **zh-Hans** - Chinese (Simplified)
- **zh-Hant** - Chinese (Traditional)

## What it does

The script will:

1. **Fetch** the English version of the POI recommendation with populated POI data
2. **Extract** the POI document ID from the English version
3. **Verify** that the target locale exists for the POI recommendation
4. **Update** the target locale POI recommendation with the same POI reference
5. **Validate** the update was successful

## How it works

1. **Source**: Always uses English (`en`) locale as the source of truth
2. **POI Reference**: Extracts the `poi.documentId` from the English version
3. **Target Update**: Updates the target locale with `{ poi: poiDocumentId }`
4. **Validation**: Checks if POI reference already exists and warns if it's already correct

## Features

✅ **Interactive Wizard Mode**: User-friendly interface that guides you through the process
✅ **Flexible API Configuration**: Configure Base URL and Bearer Token with smart defaults
✅ **POI Recommendation Selection**: Choose from a list showing recommendation text and documentId
✅ **Smart Validation**: Warns if POI reference is already correctly set
✅ **Locale Prerequisites Check**: Ensures target locale exists before proceeding
✅ **Error Handling**: Comprehensive validation and error reporting
✅ **Command Line Interface**: Also supports direct command-line usage
✅ **Progress Tracking**: Detailed console output with progress indicators

## API Integration

The script integrates with your Strapi API:
- **POI Recommendations List**: `GET /api/poi-recommendations` - Fetches all available POI recommendations
- **English Source**: `GET /api/poi-recommendations/{id}?locale=en&populate=poi` - Fetches English POI recommendation with POI data
- **Target Check**: `GET /api/poi-recommendations/{id}?locale={locale}&populate=poi` - Checks if target locale exists
- **Update**: `PUT /api/poi-recommendations/{id}?locale={locale}` - Updates target locale with POI reference

## Configuration

The script uses the following configuration:
- **Base URL**: `http://localhost:1337` (configurable in wizard)
- **Bearer Token**: Pre-configured with default (configurable in wizard)
- **Source Locale**: Always `en` (English)
- **Target Locales**: User selectable from supported locales

## Error Handling

The script includes comprehensive error handling and will:
- Validate document IDs
- Validate target locale exists in supported list
- Check if English POI recommendation has POI reference
- Verify target locale exists before updating
- Provide detailed error messages
- Exit with proper status codes

## Output

The script provides detailed console output including:
- Progress indicators with locale information
- POI reference information from English source
- Success/error messages
- Sync summary with POI details and locale
- Timestamp of the operation

## Example Use Case

You have a POI recommendation in English that references a specific POI (restaurant, attraction, etc.). You want to create the same POI recommendation in Chinese Traditional, but you need it to reference the same POI. This script will:

1. Read the POI reference from the English version
2. Update the Chinese Traditional version to point to the same POI
3. Ensure both locales reference the same underlying POI data

## Requirements

- Node.js
- Access to Strapi API
- Valid bearer token
- English POI recommendation must already have POI reference set
- Target locale entry must be manually created first
