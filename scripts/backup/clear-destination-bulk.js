#!/usr/bin/env node

/**
 * Clear Destination Content - BULK VERSION
 * Optimized bulk removal with parallel processing and batching
 * This script ONLY touches the DESTINATION instance - source is kept safe
 */

const config = require('./migration-config');
const axios = require('axios');

class BulkDestinationCleaner {
  constructor() {
    this.destination = config.destination;
    this.destinationToken = null;
    
    // Supported locales - need to clear all of them
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
    
    // Bulk processing configuration
    this.batchSize = 40;      // Number of parallel deletions
    this.maxRetries = 3;      // Max retries for failed deletions
    this.retryDelay = 1000;   // Delay between retries (ms)
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

  async getAllDocumentIdsForAllLocales(contentType) {
    const endpoint = this.contentTypeEndpoints[contentType];
    if (!endpoint) {
      console.error(`❌ Unknown content type: ${contentType}`);
      return [];
    }
    
    console.log(`📥 Fetching all ${contentType} document IDs from ALL locales...`);
    
    // Single types don't need to be fetched for deletion
    if (this.singleTypes.has(contentType)) {
      console.log(`   ⚪ Skipping single type ${contentType} (should not be deleted)`);
      return [];
    }
    
    let allDocumentIds = new Set(); // Use Set to avoid duplicates
    
    // Fetch from each locale
    for (const locale of this.locales) {
      console.log(`   🌍 Fetching ${locale} locale...`);
      
      let page = 1;
      const pageSize = 100;
      let localeCount = 0;
      
      while (true) {
        try {
          const response = await axios.get(`${this.destination.url}/api/${endpoint}`, {
            headers: { Authorization: `Bearer ${this.destinationToken}` },
            params: {
              'pagination[page]': page,
              'pagination[pageSize]': pageSize,
              'fields': ['documentId'],
              'locale': locale
            }
          });

          const entries = response.data.data;
          const pagination = response.data.meta?.pagination;
          
          if (!entries || entries.length === 0) {
            break;
          }
          
          // Extract documentIds and add to set
          const documentIds = entries.map(entry => entry.documentId).filter(Boolean);
          documentIds.forEach(id => allDocumentIds.add(id));
          localeCount += documentIds.length;
          
          console.log(`     📄 Page ${page}: ${documentIds.length} document IDs for ${locale}`);
          
          if (!pagination || page >= pagination.pageCount || entries.length < pageSize) {
            break;
          }
          
          page++;
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          if (error.response?.status === 404) {
            console.log(`     ⚪ No ${locale} entries found for ${contentType}`);
          } else {
            console.error(`     ❌ Error fetching ${locale} entries:`, error.response?.data || error.message);
          }
          break;
        }
      }
      
      console.log(`   ✅ ${locale}: ${localeCount} entries found`);
    }
    
    const uniqueDocumentIds = Array.from(allDocumentIds);
    console.log(`   📊 Total unique document IDs to delete: ${uniqueDocumentIds.length}`);
    return uniqueDocumentIds;
  }

  async deleteDocument(contentType, documentId, retryCount = 0) {
    const endpoint = this.contentTypeEndpoints[contentType];
    
    try {
      await axios.delete(`${this.destination.url}/api/${endpoint}/${documentId}`, {
        headers: { Authorization: `Bearer ${this.destinationToken}` },
        timeout: 10000 // 10 second timeout
      });
      
      return { success: true, documentId };
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      const statusCode = error.response?.status;
      
      // Don't retry on 404 (already deleted) or 403 (permission issue)
      if (statusCode === 404) {
        return { success: true, documentId, warning: 'Already deleted' };
      }
      
      if (statusCode === 403 || retryCount >= this.maxRetries) {
        return { 
          success: false, 
          documentId,
          error: errorMessage,
          status: statusCode,
          finalAttempt: true
        };
      }
      
      // Retry for other errors
      console.log(`     ⚠️  Retry ${retryCount + 1}/${this.maxRetries} for ${documentId}: ${errorMessage}`);
      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      return this.deleteDocument(contentType, documentId, retryCount + 1);
    }
  }

  async processBatch(contentType, documentIds, batchIndex, totalBatches) {
    console.log(`   🔄 Processing batch ${batchIndex + 1}/${totalBatches} (${documentIds.length} documents)...`);
    
    // Process deletions in parallel within the batch
    const deletePromises = documentIds.map(documentId => 
      this.deleteDocument(contentType, documentId)
    );
    
    const results = await Promise.all(deletePromises);
    
    // Analyze results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const warnings = results.filter(r => r.warning).length;
    
    console.log(`     ✅ Batch completed: ${successful} deleted, ${failed} failed${warnings > 0 ? `, ${warnings} warnings` : ''}`);
    
    return {
      successful,
      failed,
      warnings,
      errors: results.filter(r => !r.success)
    };
  }

  async clearContentTypeBulk(contentType) {
    console.log(`\n🗑️  BULK clearing ${contentType} from ALL locales...`);
    
    const documentIds = await this.getAllDocumentIdsForAllLocales(contentType);
    
    if (documentIds.length === 0) {
      console.log(`   ✅ Already empty in all locales`);
      return { success: 0, failed: 0, warnings: 0 };
    }
    
    // Split into batches
    const batches = [];
    for (let i = 0; i < documentIds.length; i += this.batchSize) {
      batches.push(documentIds.slice(i, i + this.batchSize));
    }
    
    console.log(`   📦 Processing ${documentIds.length} documents in ${batches.length} batches of ${this.batchSize}`);
    
    const totalResults = { successful: 0, failed: 0, warnings: 0, errors: [] };
    
    // Process batches sequentially to avoid overwhelming the API
    for (let i = 0; i < batches.length; i++) {
      const batchResults = await this.processBatch(contentType, batches[i], i, batches.length);
      
      totalResults.successful += batchResults.successful;
      totalResults.failed += batchResults.failed;
      totalResults.warnings += batchResults.warnings;
      totalResults.errors = totalResults.errors.concat(batchResults.errors);
      
      // Small delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`📊 ${contentType}: ${totalResults.successful} deleted, ${totalResults.failed} failed, ${totalResults.warnings} warnings`);
    
    // Log detailed errors if any
    if (totalResults.errors.length > 0) {
      console.log(`   ❌ Failed deletions:`);
      totalResults.errors.slice(0, 5).forEach(error => { // Show first 5 errors
        console.log(`     • ${error.documentId}: ${error.error}`);
      });
      if (totalResults.errors.length > 5) {
        console.log(`     • ... and ${totalResults.errors.length - 5} more errors`);
      }
    }
    
    return {
      success: totalResults.successful,
      failed: totalResults.failed,
      warnings: totalResults.warnings
    };
  }

  async run() {
    console.log('🧹 BULK DESTINATION CONTENT CLEANER');
    console.log('====================================');
    console.log('⚠️  This will DELETE ALL CONTENT from the destination Strapi instance');
    console.log('✅ Source will remain untouched and safe');
    console.log(`🌍 Clearing content from ALL locales: ${this.locales.join(', ')}`);
    console.log(`⚡ Using bulk processing: ${this.batchSize} parallel deletions per batch`);
    console.log('');
    
    await this.authenticate();
    
    console.log('\n🗑️  Starting BULK content deletion from ALL locales in reverse dependency order...');
    
    let totalDeleted = 0;
    let totalFailed = 0;
    let totalWarnings = 0;
    const startTime = Date.now();
    
    for (const contentType of this.deletionOrder) {
      try {
        const typeStartTime = Date.now();
        const result = await this.clearContentTypeBulk(contentType);
        const typeEndTime = Date.now();
        const typeDuration = ((typeEndTime - typeStartTime) / 1000).toFixed(1);
        
        totalDeleted += result.success;
        totalFailed += result.failed;
        totalWarnings += result.warnings;
        
        console.log(`   ⏱️  Completed in ${typeDuration}s`);
        
        // Delay between content types
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ Failed to clear ${contentType}:`, error.message);
        totalFailed++;
      }
    }
    
    const endTime = Date.now();
    const totalDuration = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log('\n🎉 BULK CLEANUP SUMMARY');
    console.log('=======================');
    console.log(`✅ Total entries deleted: ${totalDeleted}`);
    console.log(`❌ Total failures: ${totalFailed}`);
    console.log(`⚠️  Total warnings: ${totalWarnings}`);
    console.log(`⏱️  Total time: ${totalDuration}s`);
    console.log('');
    console.log('🔒 Source instance remains untouched');
    console.log('✨ Destination is now clean and ready for fresh migration');
    
    if (totalFailed === 0) {
      console.log('\n🚀 Ready to run migration again!');
    } else {
      console.log('\n⚠️  Some entries failed to delete - check manually if needed');
    }
    
    return totalFailed === 0;
  }
}

// Safety confirmation
async function confirmDeletion() {
  const destinationUrl = config.destination.url;
  
  console.log('🚨 SAFETY CONFIRMATION REQUIRED');
  console.log('================================');
  console.log(`You are about to BULK DELETE ALL CONTENT from ALL LOCALES: ${destinationUrl}`);
  console.log('');
  console.log('This action will:');
  console.log('✅ Keep source safe and untouched');
  console.log('❌ Delete ALL content from destination');
  console.log('🌍 Clear content from ALL supported locales (en, zh-Hans, zh-Hant, ko, ja)');
  console.log('⚡ Use optimized bulk processing for faster deletion');
  console.log('');
  
  // Auto-confirm if destination URL contains expected pattern
  if (destinationUrl.includes('laxy-studio-strapi') && destinationUrl.includes('herokuapp.com')) {
    console.log('✅ Auto-confirmed: Destination URL matches expected pattern');
    console.log('🔄 Proceeding with bulk cleanup...');
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
        const cleaner = new BulkDestinationCleaner();
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
      console.error('❌ Bulk cleanup failed:', error.message);
      process.exit(1);
    });
}

module.exports = BulkDestinationCleaner;
