#!/usr/bin/env node

/**
 * COMPLETE 4-STEP MIGRATION RUNNER
 * Runs all migration steps in sequence with proper error handling and reporting
 */

const fs = require('fs');
const path = require('path');

// Import all migration steps
const Step1EnContentMigrator = require('./step1-en-content-migrator');
const Step2NonEnLocalizationsMigrator = require('./step2-non-en-localizations-migrator');
const Step3RelationsMigrator = require('./step3-relations-migrator');
const Step4ComponentsAndRelationsMigrator = require('./step4-hub-config-components-migrator');

class CompleteMigrationRunner {
  constructor() {
    this.results = {
      step1: null,
      step2: null,
      step3: null,
      step4: null,
      overallStats: {
        startTime: new Date(),
        endTime: null,
        totalDuration: null,
        stepsCompleted: 0,
        stepsFailed: 0
      }
    };
    
    this.steps = [
      { 
        name: 'Step 1: English Content Migration', 
        class: Step1EnContentMigrator,
        description: 'Migrates all English content entries with media relations'
      },
      { 
        name: 'Step 2: Non-English Localizations Migration', 
        class: Step2NonEnLocalizationsMigrator,
        description: 'Migrates all non-English localized content entries'
      },
      { 
        name: 'Step 3: Relations Migration', 
        class: Step3RelationsMigrator,
        description: 'Updates all content relations based on new ID mappings'
      },
      { 
        name: 'Step 4: Components and Relations Migration', 
        class: Step4ComponentsAndRelationsMigrator,
        description: 'Migrates hub-application-config and suite component fields with media relations'
      }
    ];
  }

  async runStep(stepNumber, StepClass, stepName) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 STARTING ${stepName.toUpperCase()}`);
    console.log(`${'='.repeat(80)}\n`);
    
    const startTime = new Date();
    
    try {
      const migrator = new StepClass();
      await migrator.migrate();
      
      const endTime = new Date();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`\n✅ ${stepName} completed successfully in ${duration.toFixed(2)} seconds`);
      
      this.results[`step${stepNumber}`] = {
        success: true,
        startTime,
        endTime,
        duration,
        error: null
      };
      
      this.results.overallStats.stepsCompleted++;
      return true;
      
    } catch (error) {
      const endTime = new Date();
      const duration = (endTime - startTime) / 1000;
      
      console.error(`\n❌ ${stepName} failed after ${duration.toFixed(2)} seconds:`, error.message);
      
      this.results[`step${stepNumber}`] = {
        success: false,
        startTime,
        endTime,
        duration,
        error: error.message
      };
      
      this.results.overallStats.stepsFailed++;
      return false;
    }
  }

  generateFinalReport() {
    this.results.overallStats.endTime = new Date();
    this.results.overallStats.totalDuration = (this.results.overallStats.endTime - this.results.overallStats.startTime) / 1000;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 COMPLETE MIGRATION SUMMARY REPORT`);
    console.log(`${'='.repeat(80)}\n`);
    
    console.log(`🕐 Migration Timeline:`);
    console.log(`   Start Time: ${this.results.overallStats.startTime.toISOString()}`);
    console.log(`   End Time: ${this.results.overallStats.endTime.toISOString()}`);
    console.log(`   Total Duration: ${(this.results.overallStats.totalDuration / 60).toFixed(2)} minutes\n`);
    
    console.log(`📈 Overall Statistics:`);
    console.log(`   Steps Completed: ${this.results.overallStats.stepsCompleted}/4`);
    console.log(`   Steps Failed: ${this.results.overallStats.stepsFailed}/4`);
    console.log(`   Success Rate: ${((this.results.overallStats.stepsCompleted / 4) * 100).toFixed(1)}%\n`);
    
    console.log(`📋 Step-by-Step Results:`);
    
    for (let i = 1; i <= 4; i++) {
      const stepResult = this.results[`step${i}`];
      const stepInfo = this.steps[i - 1];
      
      if (stepResult) {
        const status = stepResult.success ? '✅ SUCCESS' : '❌ FAILED';
        const duration = stepResult.duration.toFixed(2);
        
        console.log(`   Step ${i}: ${status} (${duration}s)`);
        console.log(`      ${stepInfo.description}`);
        
        if (!stepResult.success) {
          console.log(`      Error: ${stepResult.error}`);
        }
        console.log('');
      } else {
        console.log(`   Step ${i}: ⏭️  SKIPPED`);
        console.log(`      ${stepInfo.description}`);
        console.log('');
      }
    }
    
    // Load and display specific migration statistics if available
    this.displayDetailedStats();
    
    console.log(`💾 Detailed results saved in individual step result files:`);
    console.log(`   • step1-en-content-results.json`);
    console.log(`   • step2-non-en-localizations-results.json`);
    console.log(`   • step3-relations-results.json`);
    console.log(`   • step4-hub-config-components-results.json`);
    
    // Save overall results
    const overallResultsPath = path.join(__dirname, 'complete-migration-results.json');
    fs.writeFileSync(overallResultsPath, JSON.stringify(this.results, null, 2));
    console.log(`   • complete-migration-results.json\n`);
    
    if (this.results.overallStats.stepsCompleted === 4) {
      console.log(`🎉 MIGRATION COMPLETED SUCCESSFULLY! 🎉`);
      console.log(`All 4 steps completed without errors.\n`);
    } else {
      console.log(`⚠️  MIGRATION COMPLETED WITH ISSUES`);
      console.log(`${this.results.overallStats.stepsFailed} step(s) failed. Check the logs above for details.\n`);
    }
  }

  displayDetailedStats() {
    try {
      console.log(`📊 Detailed Migration Statistics:\n`);
      
      // Step 1 Stats
      const step1Path = path.join(__dirname, 'step1-en-content-results.json');
      if (fs.existsSync(step1Path)) {
        const step1Results = JSON.parse(fs.readFileSync(step1Path, 'utf8'));
        console.log(`   Step 1 - English Content:`);
        console.log(`      Total Entries: ${step1Results.summary.total}`);
        console.log(`      Successful: ${step1Results.summary.success}`);
        console.log(`      Failed: ${step1Results.summary.failed}`);
        console.log(`      Media Files: ${step1Results.mediaStats?.totalProcessed || 'N/A'}`);
      }
      
      // Step 2 Stats  
      const step2Path = path.join(__dirname, 'step2-non-en-localizations-results.json');
      if (fs.existsSync(step2Path)) {
        const step2Results = JSON.parse(fs.readFileSync(step2Path, 'utf8'));
        console.log(`\n   Step 2 - Localizations:`);
        console.log(`      Total Entries: ${step2Results.summary.total}`);
        console.log(`      Successful: ${step2Results.summary.success}`);
        console.log(`      Failed: ${step2Results.summary.failed}`);
      }
      
      // Step 3 Stats
      const step3Path = path.join(__dirname, 'step3-relations-results.json');
      if (fs.existsSync(step3Path)) {
        const step3Results = JSON.parse(fs.readFileSync(step3Path, 'utf8'));
        console.log(`\n   Step 3 - Relations:`);
        console.log(`      Total Operations: ${step3Results.summary.total}`);
        console.log(`      Successful: ${step3Results.summary.success}`);
        console.log(`      Failed: ${step3Results.summary.failed}`);
        console.log(`      Skipped: ${step3Results.summary.skipped}`);
        console.log(`      Relations Mapped: ${step3Results.relationStats.mapped}/${step3Results.relationStats.total}`);
      }
      
      // Step 4 Stats
      const step4Path = path.join(__dirname, 'step4-hub-config-components-results.json');
      if (fs.existsSync(step4Path)) {
        const step4Results = JSON.parse(fs.readFileSync(step4Path, 'utf8'));
        console.log(`\n   Step 4 - Hub Config Components:`);
        console.log(`      Total Operations: ${step4Results.summary.total}`);
        console.log(`      Successful: ${step4Results.summary.success}`);
        console.log(`      Failed: ${step4Results.summary.failed}`);
        console.log(`      Components Migrated: ${step4Results.componentStats.migrated}`);
        console.log(`      Media Mapped: ${step4Results.mediaStats.mapped}/${step4Results.mediaStats.total}`);
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`   (Detailed stats unavailable: ${error.message})\n`);
    }
  }

  async run(options = {}) {
    const { startFromStep = 1, stopAtStep = 4, skipSteps = [] } = options;
    
    console.log(`🚀 STARTING COMPLETE 4-STEP STRAPI MIGRATION`);
    console.log(`============================================\n`);
    
    console.log(`⚙️  Migration Configuration:`);
    console.log(`   Start from: Step ${startFromStep}`);
    console.log(`   Stop at: Step ${stopAtStep}`);
    console.log(`   Skip steps: ${skipSteps.length > 0 ? skipSteps.join(', ') : 'None'}\n`);
    
    console.log(`📋 Migration Plan:`);
    for (let i = startFromStep; i <= stopAtStep; i++) {
      if (skipSteps.includes(i)) {
        console.log(`   Step ${i}: ⏭️  SKIP - ${this.steps[i - 1].description}`);
      } else {
        console.log(`   Step ${i}: ✅ RUN - ${this.steps[i - 1].description}`);
      }
    }
    console.log('');
    
    let shouldContinue = true;
    
    for (let i = startFromStep; i <= stopAtStep && shouldContinue; i++) {
      if (skipSteps.includes(i)) {
        console.log(`⏭️  Skipping Step ${i}...`);
        continue;
      }
      
      const stepInfo = this.steps[i - 1];
      const success = await this.runStep(i, stepInfo.class, stepInfo.name);
      
      if (!success && options.stopOnError !== false) {
        console.log(`\n⛔ Migration stopped due to error in Step ${i}`);
        shouldContinue = false;
      }
      
      // Add delay between steps to allow for system stabilization
      if (shouldContinue && i < stopAtStep) {
        console.log(`\n⏸️  Waiting 3 seconds before next step...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    this.generateFinalReport();
    
    return this.results.overallStats.stepsFailed === 0;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    startFromStep: 1,
    stopAtStep: 4,
    skipSteps: [],
    stopOnError: true
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--start-from':
        options.startFromStep = parseInt(args[++i]) || 1;
        break;
      case '--stop-at':
        options.stopAtStep = parseInt(args[++i]) || 4;
        break;
      case '--skip':
        const skipList = args[++i];
        options.skipSteps = skipList.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        break;
      case '--continue-on-error':
        options.stopOnError = false;
        break;
      case '--help':
        console.log(`
Complete Strapi Migration Runner

Usage: node run-complete-migration.js [options]

Options:
  --start-from <step>      Start from specific step (1-4, default: 1)
  --stop-at <step>         Stop at specific step (1-4, default: 4)  
  --skip <steps>           Skip specific steps (comma-separated, e.g., "1,3")
  --continue-on-error      Continue migration even if a step fails
  --help                   Show this help message

Examples:
  node run-complete-migration.js                    # Run all steps
  node run-complete-migration.js --start-from 2     # Start from step 2
  node run-complete-migration.js --skip "1,2"       # Skip steps 1 and 2
  node run-complete-migration.js --continue-on-error # Don't stop on errors
        `);
        process.exit(0);
        break;
    }
  }
  
  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  const runner = new CompleteMigrationRunner();
  
  runner.run(options)
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Migration runner encountered an unexpected error:', error);
      process.exit(1);
    });
}

module.exports = CompleteMigrationRunner;
