#!/usr/bin/env node

/**
 * Migration Runner - Easy way to run migrations with proper configuration
 */

const config = require('./migration-config');
const MasterMigrator = require('./master-migrator');
const SchemaInspector = require('./schema-inspector');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  skipSchema: args.includes('--skip-schema'),
  skipMedia: args.includes('--skip-media'),
  skipContent: args.includes('--skip-content'),
  verify: args.includes('--verify'),
  force: args.includes('--force'),
  dryRun: args.includes('--dry-run')
};

async function main() {
  console.log('🚀 Strapi Migration Tool');
  console.log('=========================\n');

  // Validate configuration
  if (config.source.url.includes('your-cloud-strapi.com') || 
      config.destination.url.includes('your-heroku-app.herokuapp.com')) {
    console.log('❌ Please update the migration configuration first!');
    console.log('Edit scripts/migration-config.js or set environment variables:');
    console.log('- SOURCE_STRAPI_URL');
    console.log('- SOURCE_USERNAME'); 
    console.log('- SOURCE_PASSWORD');
    console.log('- DEST_STRAPI_URL');
    console.log('- DEST_USERNAME');
    console.log('- DEST_PASSWORD\n');
    
    if (!options.force) {
      process.exit(1);
    }
  }

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--analyze-only')) {
    // Just run schema analysis
    console.log('📋 Running schema analysis only...\n');
    const inspector = new SchemaInspector(config.source, config.destination);
    try {
      await inspector.authenticate();
      const analysis = await inspector.analyzeSchemas();
      const counts = await inspector.getContentCounts();
      inspector.printSummary(analysis, counts);
    } catch (error) {
      console.error('❌ Schema analysis failed:', error.message);
      process.exit(1);
    }
    return;
  }

  // Run full migration
  const migrator = new MasterMigrator(config);
  
  try {
    await migrator.runMigration(options);
    console.log('\n🎉 Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Usage: node run-migration.js [options]

Options:
  --analyze-only    Run schema analysis only (no migration)
  --skip-schema     Skip schema analysis phase
  --skip-media      Skip media migration phase  
  --skip-content    Skip content migration phase
  --verify          Run verification after migration
  --force           Continue even if configuration issues detected
  --dry-run         Simulate migration without making changes
  --help, -h        Show this help message

Examples:
  node run-migration.js                    # Full migration
  node run-migration.js --analyze-only     # Just analyze schemas
  node run-migration.js --skip-media       # Skip media files
  node run-migration.js --verify --force   # Migration with verification

Configuration:
  Set environment variables or edit scripts/migration-config.js:
  - SOURCE_STRAPI_URL, SOURCE_USERNAME, SOURCE_PASSWORD
  - DEST_STRAPI_URL, DEST_USERNAME, DEST_PASSWORD
`);
}

// Run the migration
if (require.main === module) {
  main().catch(console.error);
}
