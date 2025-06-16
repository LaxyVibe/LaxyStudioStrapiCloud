#!/usr/bin/env node

/**
 * STEP 0: Complete Destination Cleaner
 * Safely removes ALL content from destination Strapi (all locales)
 * Based on clear-destination.js but enhanced for Strapi v5 multi-locale deletion
 */

const config = require('./migration-config');
const axios = require('axios');

class Step0DestinationCleaner {
  constructor() {
    this.destination = config.destination;
    this.destinationToken = null;
    this.stats = {
      documentsDeleted: 0,
      localesDeleted: 0,
      errors: 0
    };
    
    // All supported locales for comprehensive cleaning
    this.locales = ['en', 'zh-Hans', 'zh-Hant', 'ko', 'ja'];
    
    // Content type to endpoint mapping
    this.contentTypeEndpoints = {
      'api::tag-label.tag-label': 'tag-labels',
      'api::stay.stay': 'stays',
      'api::poi.poi': 'pois',
      'api::suite.suite': 'suites',
      'api::poi-recommendation.poi-recommendation': 'poi-recommendations',
      'api::hub-application-config.hub-application-config': 'hub-application-config'
    };
    
    // Single types (should not be deleted, only updated)
    this.singleTypes = new Set(['api::hub-application-config.hub-application-config']);
    
    // Deletion order (reverse of creation dependencies)
    this.deletionOrder = [
      'api::poi-recommendation.poi-recommendation', // Delete recommendations first
      'api::suite.suite',                           // Delete suites
      'api::poi.poi',                               // Delete POIs
      'api::stay.stay',                             // Delete stays
      'api::tag-label.tag-label'                    // Delete tag labels last
    ];
  }

  async authenticate() {
    console.log('🔐 Authenticating with DESTINATION only...');
    console.log(`📍 Destination: ${this.destination.url}`);
    
    if (this.destination.apiToken) {
      this.destinationToken = this.destination.apiToken;
      console.log('✅ Destination authentication using API token');
    } else {
      throw new Error('Destination API token required');
    }
    
    // Verify we're connecting to the right destination
    if (!this.destination.url.includes('laxy-studio-strapi')) {
      throw new Error(`⚠️  Safety check failed: Expected destination to contain 'laxy-studio-strapi', got: ${this.destination.url}`);
    }
    
    console.log('✅ Safety check passed - confirmed destination URL');
  }

  // Get all document IDs from destination (all locales combined)
  async getAllDocumentIds(contentType) {
    const endpoint = this.contentTypeEndpoints[contentType];
    if (!endpoint) {
      console.error(`❌ Unknown content type: ${contentType}`);
      return new Set();
    }
    
    console.log(`📥 Collecting all documentIds for ${contentType} across all locales...`);
    
    // Single types don't need to be fetched for deletion
    if (this.singleTypes.has(contentType)) {
      console.log(`   ⚪ Skipping single type ${contentType} (should not be deleted)`);
      return new Set();
    }
    
    const documentIds = new Set();
    
    // Fetch documents from all locales to get complete documentId list
    for (const locale of this.locales) {
      console.log(`   🌐 Fetching ${locale} locale...`);
      
      let page = 1;
      const pageSize = 100;
      
      while (true) {
        try {
          const response = await axios.get(`${this.destination.url}/api/${endpoint}`, {
            headers: { Authorization: `Bearer ${this.destinationToken}` },
            params: {
              'pagination[page]': page,
              'pagination[pageSize]': pageSize,
              'locale': locale
            },
            timeout: 30000
          });

          const entries = response.data.data;
          const pagination = response.data.meta?.pagination;
          
          if (!entries || entries.length === 0) {
            console.log(`     📄 ${locale} Page ${page}: No entries found`);
            break;
          }
          
          // Collect documentIds
          entries.forEach(entry => {
            if (entry.documentId) {
              documentIds.add(entry.documentId);
            }
          });
          
          console.log(`     📄 ${locale} Page ${page}: ${entries.length} entries (${documentIds.size} unique documents so far)`);
          
          if (!pagination || page >= pagination.pageCount || entries.length < pageSize) {
            break;
          }
          
          page++;
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          if (error.response?.status === 404 || error.response?.status === 400) {
            console.log(`     ⚪ ${locale} locale not found or no entries (expected for fresh instance)`);
          } else {
            console.error(`     ❌ Error fetching ${locale} entries:`, error.response?.data?.error?.message || error.message);
          }
          break;
        }
      }
    }
    
    console.log(`   📊 Total unique documents found: ${documentIds.size}`);
    return documentIds;
  }

  // Delete entire document (all locale versions)
  async deleteDocument(contentType, documentId) {
    const endpoint = this.contentTypeEndpoints[contentType];
    try {
      // Delete entire document (all locales) by using documentId without locale parameter
      await axios.delete(`${this.destination.url}/api/${endpoint}/${documentId}`, {
        headers: { Authorization: `Bearer ${this.destinationToken}` },
        timeout: 30000
      });
      
      this.stats.documentsDeleted++;
      return { success: true };
    } catch (error) {
      this.stats.errors++;
      return { 
        success: false, 
        error: error.response?.data || error.message,
        status: error.response?.status 
      };
    }
  }

  // Alternative: Delete specific locale versions if document deletion fails
  async deleteDocumentLocales(contentType, documentId) {
    const endpoint = this.contentTypeEndpoints[contentType];
    let localesDeleted = 0;
    let errors = 0;
    
    console.log(`     🌐 Attempting to delete individual locales for document ${documentId}...`);
    
    for (const locale of this.locales) {
      try {
        // Delete specific locale version
        await axios.delete(`${this.destination.url}/api/${endpoint}/${documentId}?locale=${locale}`, {
          headers: { Authorization: `Bearer ${this.destinationToken}` },
          timeout: 15000
        });
        
        localesDeleted++;
        this.stats.localesDeleted++;
        console.log(`       ✅ Deleted ${locale} locale`);
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`       ⚪ ${locale} locale not found (expected)`);
        } else {
          console.log(`       ❌ Failed to delete ${locale} locale:`, error.response?.data?.error?.message || error.message);
          errors++;
        }
      }
    }
    
    return { localesDeleted, errors };
  }

  async clearContentType(contentType) {
    console.log(`\n🗑️  Clearing ${contentType} (all locales)...`);
    
    const documentIds = await this.getAllDocumentIds(contentType);
    
    if (documentIds.size === 0) {
      console.log(`   ✅ Already empty`);
      return { success: 0, failed: 0 };
    }
    
    const results = { success: 0, failed: 0 };
    const documentIdArray = Array.from(documentIds);
    
    for (let i = 0; i < documentIdArray.length; i++) {
      const documentId = documentIdArray[i];
      console.log(`   🗑️  Deleting document ${i + 1}/${documentIdArray.length} (${documentId})...`);
      
      // Try to delete entire document first (preferred method)
      const result = await this.deleteDocument(contentType, documentId);
      
      if (result.success) {
        results.success++;
        console.log(`     ✅ Deleted entire document (all locales)`);
      } else {
        console.log(`     ⚠️  Document deletion failed, trying individual locale deletion...`);
        
        // Fallback: delete individual locale versions
        const localeResult = await this.deleteDocumentLocales(contentType, documentId);
        
        if (localeResult.localesDeleted > 0) {
          results.success++;
          console.log(`     ✅ Deleted ${localeResult.localesDeleted} locale versions`);
        } else {
          results.failed++;
          console.log(`     ❌ Failed to delete any locale versions`);
        }
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`📊 ${contentType}: ${results.success} documents deleted, ${results.failed} failed`);
    return results;
  }

  generateSummary() {
    console.log('\n📊 STEP 0: DESTINATION CLEANING SUMMARY');
    console.log('=======================================');
    console.log(`🗑️  Documents deleted: ${this.stats.documentsDeleted}`);
    console.log(`🌐 Individual locales deleted: ${this.stats.localesDeleted}`);
    console.log(`❌ Errors encountered: ${this.stats.errors}`);
    console.log('');
    console.log('✅ Source instance remains untouched');
    console.log('✨ Destination is now clean and ready for 3-step migration');
    
    if (this.stats.errors === 0) {
      console.log('\n🚀 Ready to run Step 1: English Content Migration!');
      console.log('   Next: node scripts/step1-en-content-migrator.js');
    } else {
      console.log('\n⚠️  Some entries failed to delete - check manually if needed');
    }
  }

  async run() {
    console.log('🧹 STEP 0: COMPREHENSIVE DESTINATION CLEANER');
    console.log('============================================');
    console.log('⚠️  This will DELETE ALL CONTENT (all locales) from destination Strapi');
    console.log('✅ Source will remain untouched and safe');
    console.log(`🌐 Locales to clear: ${this.locales.join(', ')}`);
    console.log('');
    
    await this.authenticate();
    
    console.log('\n🗑️  Starting comprehensive content deletion...');
    console.log('🎯 Strategy: Delete entire documents (all locales) or fallback to individual locale deletion');
    
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (const contentType of this.deletionOrder) {
      try {
        const result = await this.clearContentType(contentType);
        totalSuccess += result.success;
        totalFailed += result.failed;
        
        // Delay between content types
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to clear ${contentType}:`, error.message);
        totalFailed++;
        this.stats.errors++;
      }
    }
    
    this.generateSummary();
    
    return totalFailed === 0;
  }
}

// Safety confirmation
async function confirmDeletion() {
  const destinationUrl = config.destination.url;
  
  console.log('🚨 SAFETY CONFIRMATION REQUIRED');
  console.log('================================');
  console.log(`You are about to DELETE ALL CONTENT (all locales) from: ${destinationUrl}`);
  console.log('');
  console.log('This action will:');
  console.log('✅ Keep source safe and untouched');
  console.log('❌ Delete ALL content from destination (English + all localizations)');
  console.log('🌐 Clear locales: en, zh-Hans, zh-Hant, ko, ja');
  console.log('');
  
  // Auto-confirm if destination URL contains expected pattern
  if (destinationUrl.includes('laxy-studio-strapi') && destinationUrl.includes('herokuapp.com')) {
    console.log('✅ Auto-confirmed: Destination URL matches expected pattern');
    console.log('🔄 Proceeding with comprehensive cleanup...');
    return true;
  } else {
    console.log('❌ Safety check failed: Unexpected destination URL');
    console.log('Please verify the destination URL in migration-config.js');
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  confirmDeletion()
    .then(confirmed => {
      if (confirmed) {
        const cleaner = new Step0DestinationCleaner();
        return cleaner.run();
      } else {
        console.log('❌ Cleanup cancelled for safety');
        process.exit(1);
      }
    })
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Step 0 cleanup failed:', error.message);
      process.exit(1);
    });
}

module.exports = Step0DestinationCleaner;
