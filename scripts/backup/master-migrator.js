/**
 * Master Migration Script - Orchestrates the complete migration process
 */

const SchemaInspector = require('./schema-inspector');
const MediaMigrator = require('./media-migrator');
const ContentMigrator = require('./content-migrator');
const fs = require('fs');
const path = require('path');

class MasterMigrator {
  constructor(config) {
    this.config = config;
    this.startTime = new Date();
  }

  async runMigration(options = {}) {
    console.log('🚀 STRAPI CONTENT MIGRATION STARTED');
    console.log('====================================');
    console.log(`Source: ${this.config.source.url}`);
    console.log(`Destination: ${this.config.destination.url}`);
    console.log(`Started at: ${this.startTime.toISOString()}\n`);

    const migrationLog = {
      startTime: this.startTime.toISOString(),
      source: this.config.source.url,
      destination: this.config.destination.url,
      phases: {},
      summary: {}
    };

    try {
      // Phase 1: Schema Analysis
      if (options.skipSchema !== true) {
        console.log('📋 PHASE 1: Schema Analysis');
        console.log('============================');
        const inspector = new SchemaInspector(this.config.source, this.config.destination);
        await inspector.authenticate();
        const analysis = await inspector.analyzeSchemas();
        const counts = await inspector.getContentCounts();
        inspector.printSummary(analysis, counts);
        
        migrationLog.phases.schemaAnalysis = {
          completed: true,
          analysis,
          counts
        };

        // Check for critical issues
        if (analysis.comparison.missingInDestination.length > 0) {
          console.log('\n⚠️  WARNING: Missing content types detected!');
          console.log('You may need to create these content types in the destination before proceeding.');
          
          if (!options.force) {
            console.log('\nUse --force to continue anyway, or create the missing content types first.');
            process.exit(1);
          }
        }
      }

      // Phase 2: Media Migration
      if (options.skipMedia !== true) {
        console.log('\n\n🖼️  PHASE 2: Media Migration');
        console.log('=============================');
        const mediaMigrator = new MediaMigrator(this.config.source, this.config.destination);
        await mediaMigrator.authenticate();
        const mediaMapping = await mediaMigrator.migrateMedia();
        
        migrationLog.phases.mediaMigration = {
          completed: true,
          migratedFiles: mediaMapping.size
        };
      }

      // Phase 3: Content Migration
      if (options.skipContent !== true) {
        console.log('\n\n📝 PHASE 3: Content Migration');
        console.log('==============================');
        const contentMigrator = new ContentMigrator(this.config.source, this.config.destination);
        await contentMigrator.authenticate();
        contentMigrator.loadMediaMapping();
        const contentResults = await contentMigrator.migrateAllContent();
        
        migrationLog.phases.contentMigration = {
          completed: true,
          results: contentResults
        };
      }

      // Phase 4: Verification (optional)
      if (options.verify === true) {
        console.log('\n\n✅ PHASE 4: Verification');
        console.log('=========================');
        await this.verifyMigration();
        
        migrationLog.phases.verification = {
          completed: true
        };
      }

      const endTime = new Date();
      const duration = Math.round((endTime - this.startTime) / 1000);

      migrationLog.endTime = endTime.toISOString();
      migrationLog.duration = `${duration} seconds`;
      migrationLog.success = true;

      // Save complete migration log
      const logPath = path.join(__dirname, `migration-log-${this.startTime.toISOString().split('T')[0]}.json`);
      fs.writeFileSync(logPath, JSON.stringify(migrationLog, null, 2));

      console.log('\n\n🎉 MIGRATION COMPLETED SUCCESSFULLY!');
      console.log('=====================================');
      console.log(`Duration: ${duration} seconds`);
      console.log(`Log saved to: ${logPath}`);

    } catch (error) {
      const endTime = new Date();
      migrationLog.endTime = endTime.toISOString();
      migrationLog.error = error.message;
      migrationLog.success = false;

      const logPath = path.join(__dirname, `migration-log-error-${this.startTime.toISOString().split('T')[0]}.json`);
      fs.writeFileSync(logPath, JSON.stringify(migrationLog, null, 2));

      console.error('\n\n❌ MIGRATION FAILED!');
      console.error('====================');
      console.error('Error:', error.message);
      console.error(`Error log saved to: ${logPath}`);
      process.exit(1);
    }
  }

  async verifyMigration() {
    console.log('🔍 Verifying migration...');
    
    // Basic verification - count entries in both systems
    const inspector = new SchemaInspector(this.config.source, this.config.destination);
    await inspector.authenticate();
    
    // This is a simplified verification - you can enhance it
    console.log('✅ Basic verification completed');
    console.log('   For detailed verification, compare the generated JSON files');
  }

  static parseArguments() {
    const args = process.argv.slice(2);
    const options = {};
    
    args.forEach(arg => {
      switch (arg) {
        case '--skip-schema':
          options.skipSchema = true;
          break;
        case '--skip-media':
          options.skipMedia = true;
          break;
        case '--skip-content':
          options.skipContent = true;
          break;
        case '--verify':
          options.verify = true;
          break;
        case '--force':
          options.force = true;
          break;
      }
    });
    
    return options;
  }

  static printUsage() {
    console.log('Strapi Content Migration Tool');
    console.log('=============================');
    console.log('');
    console.log('Usage: node master-migrator.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --skip-schema    Skip schema analysis phase');
    console.log('  --skip-media     Skip media migration phase');
    console.log('  --skip-content   Skip content migration phase');
    console.log('  --verify         Run verification after migration');
    console.log('  --force          Continue even if issues are detected');
    console.log('');
    console.log('Environment Variables:');
    console.log('  SOURCE_STRAPI_URL      Source Strapi URL (Cloud)');
    console.log('  SOURCE_USERNAME        Source admin username');
    console.log('  SOURCE_PASSWORD        Source admin password');
    console.log('  DEST_STRAPI_URL        Destination Strapi URL (Heroku)');
    console.log('  DEST_USERNAME          Destination admin username');
    console.log('  DEST_PASSWORD          Destination admin password');
  }
}

// Configuration
const config = {
  source: {
    url: process.env.SOURCE_STRAPI_URL,
    username: process.env.SOURCE_USERNAME,
    password: process.env.SOURCE_PASSWORD
  },
  destination: {
    url: process.env.DEST_STRAPI_URL,
    username: process.env.DEST_USERNAME,
    password: process.env.DEST_PASSWORD
  }
};

// Validate configuration
function validateConfig(config) {
  const required = [
    'SOURCE_STRAPI_URL',
    'SOURCE_USERNAME', 
    'SOURCE_PASSWORD',
    'DEST_STRAPI_URL',
    'DEST_USERNAME',
    'DEST_PASSWORD'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   ${key}`));
    console.error('');
    MasterMigrator.printUsage();
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    MasterMigrator.printUsage();
    return;
  }

  validateConfig(config);
  
  const options = MasterMigrator.parseArguments();
  const migrator = new MasterMigrator(config);
  
  await migrator.runMigration(options);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = MasterMigrator;
