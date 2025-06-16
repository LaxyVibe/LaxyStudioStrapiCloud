# Strapi Content Migration Scripts

This directory contains scripts to migrate content from one Strapi instance to another using API calls.

## Prerequisites

1. **Node.js packages**: Install required dependencies
   ```bash
   npm install axios form-data
   ```

2. **Environment Variables**: Create a `.env` file or set these environment variables:
   ```
   SOURCE_STRAPI_URL=https://your-cloud-strapi.com
   SOURCE_USERNAME=admin@example.com
   SOURCE_PASSWORD=your-password
   
   DEST_STRAPI_URL=https://your-heroku-strapi.herokuapp.com
   DEST_USERNAME=admin@example.com
   DEST_PASSWORD=your-password
   ```

3. **Admin Access**: Ensure you have admin access to both Strapi instances

## Scripts Overview

### 1. `schema-inspector.js`
Analyzes and compares schemas between source and destination Strapi instances.

**Usage:**
```bash
node schema-inspector.js
```

**Output:**
- `schema-analysis.json` - Detailed schema comparison
- `content-counts.json` - Entry counts for each content type

### 2. `media-migrator.js`
Downloads media files from source and uploads them to destination.

**Usage:**
```bash
node media-migrator.js
```

**Output:**
- `media-mapping.json` - Maps source media IDs to destination media IDs
- Downloads files to `temp/` directory (cleaned up after upload)

### 3. `content-migrator.js`
Migrates content entries, handling relationships and media references.

**Usage:**
```bash
node content-migrator.js
```

**Output:**
- `content-migration-results.json` - Detailed migration results
- Uses media mappings from previous step

### 4. `master-migrator.js`
Orchestrates the complete migration process.

**Usage:**
```bash
# Full migration
node master-migrator.js

# Skip certain phases
node master-migrator.js --skip-media
node master-migrator.js --skip-schema --verify

# Force continue despite warnings
node master-migrator.js --force
```

**Options:**
- `--skip-schema` - Skip schema analysis
- `--skip-media` - Skip media migration
- `--skip-content` - Skip content migration
- `--verify` - Run verification after migration
- `--force` - Continue even if issues are detected

## Migration Process

### Phase 1: Schema Analysis
1. Connects to both Strapi instances
2. Compares content types and their schemas
3. Identifies missing content types in destination
4. Counts existing content entries

### Phase 2: Media Migration
1. Downloads all media files from source
2. Uploads them to destination Strapi
3. Creates ID mapping for reference updates
4. Handles duplicates by checking file names/sizes

### Phase 3: Content Migration
1. Migrates content in dependency order:
   - Single types first (no dependencies)
   - Collection types without relations
   - Collection types with relations
2. Updates media references using ID mappings
3. Preserves published/draft status
4. Handles relationships between content

### Phase 4: Verification (Optional)
1. Compares entry counts between source and destination
2. Validates that migration completed successfully

## Important Notes

### Before Migration
1. **Backup**: Always backup your destination database
2. **Schema**: Ensure destination has all required content types
3. **Permissions**: Verify admin access to both instances
4. **Resources**: Ensure adequate disk space for media files

### During Migration
1. **Time**: Large datasets may take significant time
2. **Network**: Stable internet connection required
3. **Rate Limiting**: Scripts include delays to avoid overwhelming servers
4. **Monitoring**: Watch logs for errors and warnings

### After Migration
1. **Verification**: Check entry counts and content integrity
2. **Media**: Verify media files are accessible
3. **Relationships**: Test that related content links properly
4. **Performance**: Check if indexes need rebuilding

## Troubleshooting

### Common Issues

**Authentication Errors**
- Verify credentials in environment variables
- Check that admin users exist in both instances

**Media Migration Failures**
- Check network connectivity
- Verify source media URLs are accessible
- Ensure destination has adequate storage

**Content Migration Errors**
- Missing content types in destination
- Required fields not matching between schemas
- Relationship targets don't exist

**Rate Limiting**
- Reduce batch sizes in scripts
- Increase delays between requests
- Use multiple smaller migration runs

### Error Recovery

If migration fails partway through:

1. **Check logs**: Review generated JSON files for details
2. **Resume**: Use skip options to avoid re-doing completed phases
3. **Clean up**: Remove partial data if necessary
4. **Retry**: Fix issues and re-run specific phases

### Performance Tips

1. **Media**: Pre-upload large media files manually if needed
2. **Batching**: Migrate content types separately for large datasets
3. **Timing**: Run during low-traffic periods
4. **Resources**: Use powerful machines for large migrations

## Files Generated

- `schema-analysis.json` - Schema comparison results
- `content-counts.json` - Entry counts by content type
- `media-mapping.json` - Source to destination media ID mappings
- `content-migration-results.json` - Content migration detailed results
- `migration-log-YYYY-MM-DD.json` - Complete migration log
- `temp/` - Temporary directory for downloaded media (auto-cleaned)

## Security Considerations

1. **Credentials**: Never commit passwords to version control
2. **Environment**: Use secure environment variable management
3. **Network**: Ensure secure connections (HTTPS)
4. **Access**: Limit admin access after migration
5. **Cleanup**: Remove temporary files and logs from production servers
