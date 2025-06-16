#!/usr/bin/env node

/**
 * Simple Content Migrator - Direct API approach for custom content types
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class SimpleContentMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.results = {
      migrated: {},
      errors: {},
      summary: { total: 0, success: 0, failed: 0 }
    };
    
    // Content type to endpoint mapping
    this.contentTypeEndpoints = {
      'api::tag-label.tag-label': 'tag-labels',
      'api::stay.stay': 'stays',
      'api::poi.poi': 'pois',
      'api::suite.suite': 'suites',
      'api::poi-recommendation.poi-recommendation': 'poi-recommendations',
      'api::hub-application-config.hub-application-config': 'hub-application-config'
    };
  }

  async authenticate() {
    console.log('🔐 Authenticating...');
    
    if (this.source.apiToken) {
      this.sourceToken = this.source.apiToken;
      console.log('✅ Source authentication using API token');
    } else {
      console.log('❌ No source API token found');
      throw new Error('Source API token required');
    }

    if (this.destination.apiToken) {
      this.destinationToken = this.destination.apiToken;
      console.log('✅ Destination authentication using API token');
    } else {
      console.log('❌ No destination API token found');
      throw new Error('Destination API token required');
    }
  }

  loadMediaMapping() {
    try {
      const mappingPath = path.join(__dirname, 'media-mapping.json');
      if (fs.existsSync(mappingPath)) {
        const data = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        this.mediaMapping = new Map(Object.entries(data.mapping));
        console.log(`📁 Loaded ${this.mediaMapping.size} media mappings`);
      }
    } catch (error) {
      console.warn('⚠️  Could not load media mapping:', error.message);
    }
  }

  async getEntries(contentType) {
    console.log(`📥 Fetching entries for ${contentType}...`);
    
    const endpoint = this.contentTypeEndpoints[contentType];
    if (!endpoint) {
      console.error(`❌ Unknown content type: ${contentType}`);
      return [];
    }
    
    let allEntries = [];
    let page = 1;
    const pageSize = 100;
    
    while (true) {
      try {
        const response = await axios.get(`${this.source.url}/api/${endpoint}`, {
          headers: { Authorization: `Bearer ${this.sourceToken}` },
          params: {
            'pagination[page]': page,
            'pagination[pageSize]': pageSize,
            'populate': '*'
          }
        });

        const entries = response.data.data;
        if (!entries || entries.length === 0) break;
        
        allEntries = allEntries.concat(entries);
        console.log(`   📄 Page ${page}: ${entries.length} entries`);
        
        if (entries.length < pageSize) break;
        page++;
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Error fetching ${contentType}:`, error.response?.data || error.message);
        break;
      }
    }
    
    console.log(`   📊 Total entries found: ${allEntries.length}`);
    return allEntries;
  }

  transformMediaReferences(data) {
    if (!data || typeof data !== 'object') return data;
    
    if (Array.isArray(data)) {
      return data.map(item => this.transformMediaReferences(item));
    }
    
    // Handle media references
    if (data.id && data.url && data.mime) {
      // This looks like a media object
      const newId = this.mediaMapping.get(data.id.toString());
      if (newId) {
        return { ...data, id: parseInt(newId) };
      }
    }
    
    // Recursively transform nested objects
    const transformed = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'id' || key === 'documentId' || key === 'createdAt' || key === 'updatedAt' || key === 'publishedAt') {
        // Skip system fields
        continue;
      }
      transformed[key] = this.transformMediaReferences(value);
    }
    
    return transformed;
  }

  async createEntry(contentType, entryData) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      if (!endpoint) {
        throw new Error(`Unknown content type: ${contentType}`);
      }
      
      const transformedData = this.transformMediaReferences(entryData);
      
      const response = await axios.post(`${this.destination.url}/api/${endpoint}`, {
        data: transformedData
      }, {
        headers: { 
          Authorization: `Bearer ${this.destinationToken}`,
          'Content-Type': 'application/json'
        }
      });

      return { success: true, data: response.data };
    } catch (error) {
      console.error(`❌ Error creating entry:`, error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async migrateContentType(contentType) {
    console.log(`\n🚀 Migrating ${contentType}...`);
    
    const entries = await this.getEntries(contentType);
    const results = { success: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`   📝 Creating entry ${i + 1}/${entries.length}...`);
      
      const result = await this.createEntry(contentType, entry);
      
      if (result.success) {
        results.success++;
        console.log(`   ✅ Success`);
      } else {
        results.failed++;
        results.errors.push(result.error);
        console.log(`   ❌ Failed: ${result.error}`);
      }
      
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`📊 ${contentType} migration complete: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  async run() {
    console.log('🚀 Simple Content Migration Starting...');
    
    await this.authenticate();
    this.loadMediaMapping();
    
    // Migration order based on dependencies
    const migrationOrder = [
      'api::tag-label.tag-label',      // Independent
      'api::stay.stay',                // Independent  
      'api::poi.poi',                  // Depends on tag-label
      'api::suite.suite',              // Depends on stay
      'api::poi-recommendation.poi-recommendation', // Depends on poi and stay
      'api::hub-application-config.hub-application-config' // Single type
    ];

    for (const contentType of migrationOrder) {
      try {
        const result = await this.migrateContentType(contentType);
        this.results.migrated[contentType] = result;
        this.results.summary.success += result.success;
        this.results.summary.failed += result.failed;
        this.results.summary.total += result.success + result.failed;
      } catch (error) {
        console.error(`❌ Failed to migrate ${contentType}:`, error.message);
        this.results.errors[contentType] = error.message;
      }
    }

    // Save results
    const resultsPath = path.join(__dirname, 'simple-migration-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));

    console.log('\n🎉 MIGRATION SUMMARY');
    console.log('===================');
    console.log(`Total entries: ${this.results.summary.total}`);
    console.log(`✅ Success: ${this.results.summary.success}`);
    console.log(`❌ Failed: ${this.results.summary.failed}`);
    console.log(`📁 Results saved to: ${resultsPath}`);

    return this.results.summary.failed === 0;
  }
}

// Run if called directly
if (require.main === module) {
  const migrator = new SimpleContentMigrator();
  migrator.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = SimpleContentMigrator;
