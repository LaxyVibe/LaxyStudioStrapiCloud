# 🚀 Complete 4-Step Strapi Migration Guide

A comprehensive migration system for Strapi v5 that handles content, localizations, relations, and components with media mapping.

## 📋 Overview

This migration system consists of 4 sequential steps designed to migrate content from one Strapi instance to another:

1. **Step 1**: English Content Migration (with media)
2. **Step 2**: Non-English Localizations Migration  
3. **Step 3**: Relations Migration (content relations only)
4. **Step 4**: Components and Relations Migration (hub-application-config + suite components)

## 🛠️ Prerequisites

- Node.js 18+ 
- Source and destination Strapi v5 instances
- API tokens for both instances
- Proper environment configuration

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Source Strapi Instance
SOURCE_STRAPI_URL=https://your-source-strapi.com
SOURCE_API_TOKEN=your_source_api_token

# Destination Strapi Instance  
DEST_STRAPI_URL=https://your-destination-strapi.com
DEST_API_TOKEN=your_destination_api_token
```

### Migration Configuration

Edit `scripts/migration-config.js` to configure:
- Content type processing order
- Batch sizes and retry settings
- Skip content types if needed

## 🚀 Quick Start

### Run Complete Migration

```bash
# Run all 4 steps in sequence
npm run migrate

# Or manually:
node scripts/run-complete-migration.js
```

### Run Individual Steps

```bash
# Step 1: English Content + Media
npm run migrate:step1

# Step 2: Non-English Localizations
npm run migrate:step2

# Step 3: Content Relations
npm run migrate:step3

# Step 4: Hub Config Components
npm run migrate:step4
```

## 📊 Step Details

### Step 1: English Content Migration
- **Purpose**: Migrates all English content entries with media relations
- **Content Types**: tag-labels, stays, pois, suites, poi-recommendations
- **Features**:
  - Media file migration and mapping
  - ID mapping generation for subsequent steps
  - Batch processing with rate limiting
  - Comprehensive error handling

**Key Files Generated**:
- `step1-en-content-results.json` - Migration results
- `step1-en-content-mappings.json` - ID mappings
- `mediaMappings.json` - Media ID mappings

### Step 2: Non-English Localizations Migration
- **Purpose**: Migrates all localized content (zh-Hans, zh-Hant, ko, ja)
- **Dependencies**: Requires Step 1 completion
- **Features**:
  - Uses documentId linking to connect localizations
  - Processes all locales for each content type
  - Maintains content relationships

**Key Files Generated**:
- `step2-non-en-localizations-results.json` - Migration results

### Step 3: Relations Migration
- **Purpose**: Updates all content relations based on new ID mappings
- **Dependencies**: Requires Steps 1 & 2 completion
- **Features**:
  - Comprehensive relation field mapping
  - Handles complex nested relations
  - Processes all locales
  - Skips unmapped relations gracefully

**Key Files Generated**:
- `step3-relations-results.json` - Migration results

### Step 4: Hub Config Components Migration  
- **Purpose**: Migrates hub-application-config Single Type with deep component population
- **Dependencies**: Requires media mappings from Step 1
- **Features**:
  - **Strapi v5 populate syntax** for nested components
  - Component media relation mapping
  - Handles complex component structures:
    - Navigation arrays with icons
    - Button components with media
    - Multi-level nested components
  - Processes all locales
  - Component ID cleanup (removes IDs before migration)

**Key Files Generated**:
- `step4-hub-config-components-results.json` - Migration results

## 🔧 Advanced Usage

### Custom Migration Options

```bash
# Start from a specific step
node scripts/run-complete-migration.js --start-from 2

# Stop at a specific step
node scripts/run-complete-migration.js --stop-at 3

# Skip specific steps
node scripts/run-complete-migration.js --skip "1,3"

# Continue on errors
node scripts/run-complete-migration.js --continue-on-error
```

### Individual Step Configuration

Each step can be customized by editing its respective file:
- `step1-en-content-migrator.js` - Content limits, media settings
- `step2-non-en-localizations-migrator.js` - Locale settings
- `step3-relations-migrator.js` - Relation field mappings
- `step4-hub-config-components-migrator.js` - Component populate settings

## 📈 Monitoring & Results

### Result Files

Each step generates detailed JSON result files:
- Migration statistics
- Success/failure counts per content type and locale
- Error details for troubleshooting
- Performance metrics

### Console Output

Real-time progress monitoring with:
- ✅ Success indicators
- ❌ Error reporting  
- 📊 Statistics and counters
- 🖼️ Media mapping status
- 🧩 Component processing details

## 🔍 Troubleshooting

### Common Issues

1. **Authentication Errors (401)**
   - Verify API tokens are correct
   - Check token permissions in Strapi admin

2. **Media Mapping Issues**
   - Ensure Step 1 completed successfully
   - Check `mediaMappings.json` exists

3. **Component Validation Errors**
   - Verify component schema matches between instances
   - Check for typos in field names (e.g., "naviagtion")

4. **Relation Mapping Failures**
   - Ensure Steps 1 & 2 completed before Step 3
   - Check ID mappings in generated files

### Error Recovery

If a step fails:
1. Check the error details in console output
2. Review the result JSON file for specific failures
3. Fix the underlying issue
4. Re-run the specific step or continue from where it failed

## 🎯 Best Practices

1. **Pre-Migration**:
   - Backup both source and destination instances
   - Test with a subset of content first
   - Verify schema compatibility

2. **During Migration**:
   - Monitor console output for errors
   - Don't interrupt the process mid-step
   - Check network connectivity for large media transfers

3. **Post-Migration**:
   - Verify content in destination instance
   - Test functionality with migrated data
   - Save result files for audit trail

## 📋 Content Type Support

### Supported Content Types
- ✅ **tag-label** - Tag labels with localization
- ✅ **stay** - Accommodation entries with media
- ✅ **poi** - Points of interest with relations to tag-labels
- ✅ **suite** - Room/suite information with media and relations
- ✅ **poi-recommendation** - POI recommendations with relations
- ✅ **hub-application-config** - Single Type with complex components

### Component Support (Step 4)
- ✅ **Header components** with media icons
- ✅ **Navigation arrays** with nested button components
- ✅ **Button components** with media icons
- ✅ **Multi-level nested components**
- ✅ **Media relation mapping** within components

## 🚨 Important Notes

1. **Order Dependency**: Steps must be run in sequence (1→2→3→4)
2. **Media Files**: Step 1 handles media migration; subsequent steps use mappings
3. **ID Mapping**: Critical for relation integrity across steps
4. **Component IDs**: Step 4 automatically removes component IDs to prevent conflicts
5. **Single Type**: Step 4 specifically handles the hub-application-config Single Type

## 📝 License

This migration system is part of the LaxyStudio Strapi project and follows the project's licensing terms.

---

For questions or issues, please refer to the troubleshooting section or check the generated result files for detailed error information.
