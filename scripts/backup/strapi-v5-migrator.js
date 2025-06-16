#!/usr/bin/env node

/**
 * Strapi v5 Content Migrator - Handles Strapi v5 API changes
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class StrapiV5Migrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.idMappings = new Map(); // Track old ID -> new ID mappings
    this.results = {
      migrated: {},
      errors: {},
      summary: { total: 0, success: 0, failed: 0 }
    };
    
    // Content type to endpoint mapping for Strapi v5
    this.contentTypeEndpoints = {
      'api::tag-label.tag-label': 'tag-labels',
      'api::stay.stay': 'stays',
      'api::poi.poi': 'pois',
      'api::suite.suite': 'suites',
      'api::poi-recommendation.poi-recommendation': 'poi-recommendations',
      'api::hub-application-config.hub-application-config': 'hub-application-config'
    };
    
    // Single types (different API pattern)
    this.singleTypes = new Set(['api::hub-application-config.hub-application-config']);
  }

  async authenticate() {
    console.log('🔐 Authenticating...');
    
    if (this.source.apiToken) {
      this.sourceToken = this.source.apiToken;
      console.log('✅ Source authentication using API token');
    } else {
      throw new Error('Source API token required');
    }

    if (this.destination.apiToken) {
      this.destinationToken = this.destination.apiToken;
      console.log('✅ Destination authentication using API token');
    } else {
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

  // Clean entry data for Strapi v5
  cleanEntryData(entry, contentType) {
    const cleaned = { ...entry };
    
    // Remove system fields that shouldn't be included in creation
    delete cleaned.id;
    delete cleaned.documentId;
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    delete cleaned.publishedAt;
    delete cleaned.createdBy;
    delete cleaned.updatedBy;
    
    // Handle i18n - keep locale if present but remove localizations
    delete cleaned.localizations;
    
    // Process media fields and relations
    this.processFields(cleaned, contentType);
    
    return cleaned;
  }

  // Process fields to handle media and relations properly
  processFields(data, contentType) {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (Array.isArray(value)) {
        // Handle array of objects (relations or media)
        data[key] = value.map(item => {
          if (item && typeof item === 'object') {
            if (item.id && (item.url || item.mime)) {
              // This is a media object - return just the ID (with mapping)
              const mappedId = this.mediaMapping.get(item.id.toString());
              return mappedId ? parseInt(mappedId) : item.id;
            } else if (item.id) {
              // This is a relation - check if we have a mapping for this ID
              const mappingKey = `${this.getContentTypeFromRelation(key)}_${item.id}`;
              const mappedId = this.idMappings.get(mappingKey);
              return mappedId ? mappedId : item.id;
            }
          }
          return item;
        });
      } else if (value && typeof value === 'object') {
        if (value.id && (value.url || value.mime)) {
          // Single media object
          const mappedId = this.mediaMapping.get(value.id.toString());
          data[key] = mappedId ? parseInt(mappedId) : value.id;
        } else if (value.id) {
          // Single relation - check if we have a mapping
          const mappingKey = `${this.getContentTypeFromRelation(key)}_${value.id}`;
          const mappedId = this.idMappings.get(mappingKey);
          data[key] = mappedId ? mappedId : value.id;
        } else {
          // Nested object - recurse
          this.processFields(value, contentType);
        }
      }
    }
  }

  // Get content type from relation field name
  getContentTypeFromRelation(fieldName) {
    const relationMappings = {
      'tag_labels': 'api::tag-label.tag-label',
      'ownedBy': 'api::stay.stay',
      'poi': 'api::poi.poi',
      'recommendedBy': 'api::stay.stay',
      'pickedPOIs': 'api::poi.poi'
    };
    return relationMappings[fieldName] || 'unknown';
  }

  async getEntries(contentType) {
    console.log(`📥 Fetching entries for ${contentType}...`);
    
    const endpoint = this.contentTypeEndpoints[contentType];
    if (!endpoint) {
      console.error(`❌ Unknown content type: ${contentType}`);
      return [];
    }
    
    // Handle single types differently
    if (this.singleTypes.has(contentType)) {
      try {
        const response = await axios.get(`${this.source.url}/api/${endpoint}`, {
          headers: { Authorization: `Bearer ${this.sourceToken}` },
          params: {
            'populate': '*'
          }
        });

        if (response.data.data) {
          console.log(`   📄 Single type entry found`);
          return [response.data.data];
        }
        return [];
      } catch (error) {
        console.error(`❌ Error fetching single type ${contentType}:`, error.response?.data || error.message);
        return [];
      }
    }
    
    // Handle collection types
    let allEntries = [];
    let page = 1;
    const pageSize = 25; // Smaller page size to avoid timeouts
    
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
        const pagination = response.data.meta?.pagination;
        
        if (!entries || entries.length === 0) {
          console.log(`   📄 Page ${page}: No more entries`);
          break;
        }
        
        allEntries = allEntries.concat(entries);
        console.log(`   📄 Page ${page}: ${entries.length} entries (Total so far: ${allEntries.length})`);
        
        // Check if we've reached the end
        if (!pagination || page >= pagination.pageCount || entries.length < pageSize) {
          break;
        }
        
        page++;
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`❌ Error fetching ${contentType} page ${page}:`, error.response?.data || error.message);
        break;
      }
    }
    
    console.log(`   📊 Total entries found: ${allEntries.length}`);
    return allEntries;
  }

  async createEntry(contentType, entryData) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      if (!endpoint) {
        throw new Error(`Unknown content type: ${contentType}`);
      }
      
      const cleanedData = this.cleanEntryData(entryData, contentType);
      
      // For single types, use PUT instead of POST
      if (this.singleTypes.has(contentType)) {
        const response = await axios.put(`${this.destination.url}/api/${endpoint}`, {
          data: cleanedData
        }, {
          headers: { 
            Authorization: `Bearer ${this.destinationToken}`,
            'Content-Type': 'application/json'
          }
        });
        return { success: true, data: response.data };
      } else {
        const response = await axios.post(`${this.destination.url}/api/${endpoint}`, {
          data: cleanedData
        }, {
          headers: { 
            Authorization: `Bearer ${this.destinationToken}`,
            'Content-Type': 'application/json'
          }
        });
        return { success: true, data: response.data };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data || error.message,
        status: error.response?.status 
      };
    }
  }

  async migrateContentType(contentType) {
    console.log(`\n🚀 Migrating ${contentType}...`);
    
    const entries = await this.getEntries(contentType);
    if (entries.length === 0) {
      console.log(`   ⚠️  No entries found for ${contentType}`);
      return { success: 0, failed: 0, errors: [] };
    }
    
    const results = { success: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`   📝 Creating entry ${i + 1}/${entries.length}...`);
      
      const result = await this.createEntry(contentType, entry);
      
      if (result.success) {
        results.success++;
        console.log(`   ✅ Success`);
        
        // Store ID mapping for this entry
        const oldId = entry.id;
        const newId = result.data.data.id;
        const mappingKey = `${contentType}_${oldId}`;
        this.idMappings.set(mappingKey, newId);
        console.log(`   📌 Mapped ${contentType} ${oldId} -> ${newId}`);
      } else {
        results.failed++;
        results.errors.push({
          index: i + 1,
          error: result.error,
          status: result.status,
          originalId: entry.id
        });
        console.log(`   ❌ Failed: ${result.error?.error?.message || result.error?.message || result.error}`);
        
        // Log detailed error for debugging
        if (result.error?.error?.details) {
          console.log(`      Details: ${JSON.stringify(result.error.error.details, null, 2)}`);
        }
      }
      
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`📊 ${contentType} migration complete: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  async run() {
    console.log('🚀 Strapi v5 Content Migration Starting...');
    console.log('==========================================');
    
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
        
        // Add delay between content types
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to migrate ${contentType}:`, error.message);
        this.results.errors[contentType] = error.message;
      }
    }

    // Save results and mappings
    const resultsPath = path.join(__dirname, 'strapi-v5-migration-results.json');
    const mappingsPath = path.join(__dirname, 'strapi-v5-id-mappings.json');
    
    fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
    
    const mappingsObj = Object.fromEntries(this.idMappings);
    fs.writeFileSync(mappingsPath, JSON.stringify(mappingsObj, null, 2));

    console.log('\n🎉 MIGRATION SUMMARY');
    console.log('===================');
    console.log(`Total entries: ${this.results.summary.total}`);
    console.log(`✅ Success: ${this.results.summary.success}`);
    console.log(`❌ Failed: ${this.results.summary.failed}`);
    console.log(`📁 Results saved to: ${resultsPath}`);
    console.log(`🔗 ID mappings saved to: ${mappingsPath}`);

    if (this.results.summary.failed > 0) {
      console.log('\n❌ ERRORS BY CONTENT TYPE:');
      for (const [contentType, result] of Object.entries(this.results.migrated)) {
        if (result.failed > 0) {
          console.log(`${contentType}: ${result.failed} failed`);
          result.errors.slice(0, 3).forEach(error => {
            console.log(`  - ${error.error?.message || error.error}`);
          });
        }
      }
    }

    return this.results.summary.failed === 0;
  }
}

// Run if called directly
if (require.main === module) {
  const migrator = new StrapiV5Migrator();
  migrator.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = StrapiV5Migrator;
