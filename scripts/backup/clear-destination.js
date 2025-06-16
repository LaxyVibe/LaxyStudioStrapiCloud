#!/usr/bin/env node

/**
 * Clear Destination Content - Safely removes all content from destination Strapi
 * This script ONLY touches the DESTINATION instance - source is kept safe
 */

const config = require('./migration-config');
const axios = require('axios');

class DestinationCleaner {
  constructor() {
    this.destination = config.destination;
    this.destinationToken = null;
    
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

  async getDestinationEntries(contentType) {
    const endpoint = this.contentTypeEndpoints[contentType];
    if (!endpoint) {
      console.error(`❌ Unknown content type: ${contentType}`);
      return [];
    }
    
    console.log(`📥 Fetching ${contentType} entries from destination...`);
    
    // Single types don't need to be fetched for deletion
    if (this.singleTypes.has(contentType)) {
      console.log(`   ⚪ Skipping single type ${contentType} (should not be deleted)`);
      return [];
    }
    
    let allEntries = [];
    let page = 1;
    const pageSize = 100; // Larger page size for deletion
    
    while (true) {
      try {
        const response = await axios.get(`${this.destination.url}/api/${endpoint}`, {
          headers: { Authorization: `Bearer ${this.destinationToken}` },
          params: {
            'pagination[page]': page,
            'pagination[pageSize]': pageSize
          }
        });

        const entries = response.data.data;
        const pagination = response.data.meta?.pagination;
        
        if (!entries || entries.length === 0) {
          break;
        }
        
        allEntries = allEntries.concat(entries);
        console.log(`   📄 Page ${page}: ${entries.length} entries (Total: ${allEntries.length})`);
        
        if (!pagination || page >= pagination.pageCount || entries.length < pageSize) {
          break;
        }
        
        page++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`   ⚪ Content type ${contentType} not found in destination (already empty)`);
        } else {
          console.error(`❌ Error fetching ${contentType}:`, error.response?.data || error.message);
        }
        break;
      }
    }
    
    console.log(`   📊 Total entries to delete: ${allEntries.length}`);
    return allEntries;
  }

  async deleteEntry(contentType, entry) {
    const endpoint = this.contentTypeEndpoints[contentType];
    try {
      // Use documentId for Strapi v5 deletion
      const documentId = entry.documentId;
      
      await axios.delete(`${this.destination.url}/api/${endpoint}/${documentId}`, {
        headers: { Authorization: `Bearer ${this.destinationToken}` }
      });
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data || error.message,
        status: error.response?.status 
      };
    }
  }

  async clearContentType(contentType) {
    console.log(`\n🗑️  Clearing ${contentType}...`);
    
    const entries = await this.getDestinationEntries(contentType);
    
    if (entries.length === 0) {
      console.log(`   ✅ Already empty`);
      return { success: entries.length, failed: 0 };
    }
    
    const results = { success: 0, failed: 0 };
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`   🗑️  Deleting entry ${i + 1}/${entries.length} (ID: ${entry.id})...`);
      
      const result = await this.deleteEntry(contentType, entry);
      
      if (result.success) {
        results.success++;
        console.log(`   ✅ Deleted`);
      } else {
        results.failed++;
        console.log(`   ❌ Failed: ${result.error?.error?.message || result.error?.message || result.error}`);
      }
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`📊 ${contentType}: ${results.success} deleted, ${results.failed} failed`);
    return results;
  }

  async run() {
    console.log('🧹 DESTINATION CONTENT CLEANER');
    console.log('==============================');
    console.log('⚠️  This will DELETE ALL CONTENT from the destination Strapi instance');
    console.log('✅ Source will remain untouched and safe');
    console.log('');
    
    await this.authenticate();
    
    console.log('\n🗑️  Starting content deletion in reverse dependency order...');
    
    let totalDeleted = 0;
    let totalFailed = 0;
    
    for (const contentType of this.deletionOrder) {
      try {
        const result = await this.clearContentType(contentType);
        totalDeleted += result.success;
        totalFailed += result.failed;
        
        // Delay between content types
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to clear ${contentType}:`, error.message);
        totalFailed++;
      }
    }
    
    console.log('\n🎉 CLEANUP SUMMARY');
    console.log('==================');
    console.log(`✅ Total entries deleted: ${totalDeleted}`);
    console.log(`❌ Total failures: ${totalFailed}`);
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
  console.log(`You are about to DELETE ALL CONTENT from: ${destinationUrl}`);
  console.log('');
  console.log('This action will:');
  console.log('✅ Keep source safe and untouched');
  console.log('❌ Delete ALL content from destination');
  console.log('');
  
  // Auto-confirm if destination URL contains expected pattern
  if (destinationUrl.includes('laxy-studio-strapi') && destinationUrl.includes('herokuapp.com')) {
    console.log('✅ Auto-confirmed: Destination URL matches expected pattern');
    console.log('🔄 Proceeding with cleanup...');
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
        const cleaner = new DestinationCleaner();
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
      console.error('❌ Cleanup failed:', error.message);
      process.exit(1);
    });
}

module.exports = DestinationCleaner;
