#!/usr/bin/env node

/**
 * Improved Strapi v5 Migrator - Handles failures and early termination
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ImprovedStrapiV5Migrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.idMappings = new Map();
    this.documentIdMappings = new Map(); // Track documentId mappings for v5
    this.results = {
      pass1: {},
      pass2: {},
      summary: { pass1: { total: 0, success: 0, failed: 0 }, pass2: { total: 0, success: 0, failed: 0 } }
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
    
    // Early termination settings
    this.maxConsecutiveFailures = 3;
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

  // Clean entry data for Strapi v5 - Pass 1 (no relations)
  cleanEntryDataPass1(entry, contentType) {
    const cleaned = { ...entry };
    
    // Remove ALL system fields that shouldn't be included in creation
    delete cleaned.id;
    delete cleaned.documentId;
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    delete cleaned.publishedAt;
    delete cleaned.createdBy;
    delete cleaned.updatedBy;
    delete cleaned.localizations;
    delete cleaned.locale; // Remove locale field
    
    // Remove all relation fields for Pass 1
    this.removeRelationFields(cleaned, contentType);
    
    // Process media fields only
    this.processMediaFields(cleaned);
    
    // Deep clean any nested objects/components that might contain system fields
    this.deepCleanSystemFields(cleaned);
    
    return cleaned;
  }

  // Clean entry data for Strapi v5 - Pass 2 (only relations)
  cleanEntryDataPass2(entry, contentType) {
    const cleaned = {};
    
    // Only include relation fields for Pass 2
    this.extractRelationFields(entry, cleaned, contentType);
    
    // Process relations with ID mappings
    this.processRelationFields(cleaned, contentType);
    
    return cleaned;
  }

  // Deep clean system fields from nested objects/components
  deepCleanSystemFields(data) {
    if (!data || typeof data !== 'object') {
      return;
    }

    if (Array.isArray(data)) {
      data.forEach(item => this.deepCleanSystemFields(item));
      return;
    }

    // Remove system fields from current level
    delete data.id;
    delete data.documentId;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.publishedAt;
    delete data.createdBy;
    delete data.updatedBy;
    delete data.localizations;
    delete data.locale;

    // Recursively clean nested objects
    Object.values(data).forEach(value => {
      if (value && typeof value === 'object') {
        this.deepCleanSystemFields(value);
      }
    });
  }

  // Remove relation fields from data
  removeRelationFields(data, contentType) {
    const relationFields = this.getRelationFields(contentType);
    relationFields.forEach(field => {
      delete data[field];
    });
    
    // Also remove any nested component fields that might contain relations
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Check if this is a relation object (has id and looks like a relation)
        if (value.id !== undefined && !value.url && !value.mime) {
          delete data[key];
        }
      } else if (Array.isArray(value)) {
        // Check if array contains relation objects
        const hasRelations = value.some(item => 
          item && typeof item === 'object' && item.id !== undefined && !item.url && !item.mime
        );
        if (hasRelations) {
          delete data[key];
        }
      }
    }
  }

  // Extract only relation fields
  extractRelationFields(sourceData, targetData, contentType) {
    const relationFields = this.getRelationFields(contentType);
    relationFields.forEach(field => {
      if (sourceData[field] !== undefined) {
        targetData[field] = sourceData[field];
      }
    });
  }

  // Get relation field names for a content type
  getRelationFields(contentType) {
    const relationFieldsMap = {
      'api::tag-label.tag-label': [],
      'api::stay.stay': ['pickedPOIs'],
      'api::poi.poi': ['tag_labels'],
      'api::suite.suite': ['ownedBy'],
      'api::poi-recommendation.poi-recommendation': ['poi', 'recommendedBy'],
      'api::hub-application-config.hub-application-config': []
    };
    return relationFieldsMap[contentType] || [];
  }

  // Process media fields
  processMediaFields(data) {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (Array.isArray(value)) {
        data[key] = value.map(item => {
          if (item && typeof item === 'object' && item.id && (item.url || item.mime)) {
            const mappedId = this.mediaMapping.get(item.id.toString());
            return mappedId ? parseInt(mappedId) : item.id;
          }
          return item;
        });
      } else if (value && typeof value === 'object' && value.id && (value.url || value.mime)) {
        const mappedId = this.mediaMapping.get(value.id.toString());
        data[key] = mappedId ? parseInt(mappedId) : value.id;
      }
    }
  }

  // Process relation fields with ID mappings
  processRelationFields(data, contentType) {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (Array.isArray(value)) {
        data[key] = value.map(item => {
          if (item && typeof item === 'object' && item.id) {
            const relatedContentType = this.getContentTypeFromRelation(key);
            const mappingKey = `${relatedContentType}_${item.id}`;
            const mappedId = this.idMappings.get(mappingKey);
            return mappedId ? mappedId : item.id;
          }
          return item;
        });
      } else if (value && typeof value === 'object' && value.id) {
        const relatedContentType = this.getContentTypeFromRelation(key);
        const mappingKey = `${relatedContentType}_${value.id}`;
        const mappedId = this.idMappings.get(mappingKey);
        data[key] = mappedId ? mappedId : value.id;
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
          params: { 'populate': '*' }
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
    const pageSize = 25;
    
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
        console.log(`   📄 Page ${page}: ${entries.length} entries (Total: ${allEntries.length})`);
        
        if (!pagination || page >= pagination.pageCount || entries.length < pageSize) {
          break;
        }
        
        page++;
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
      
      const cleanedData = this.cleanEntryDataPass1(entryData, contentType);
      
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

  async updateEntryRelations(contentType, originalEntry, newId, documentId) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      if (!endpoint) {
        throw new Error(`Unknown content type: ${contentType}`);
      }
      
      const relationData = this.cleanEntryDataPass2(originalEntry, contentType);
      
      // Skip if no relations to update
      if (Object.keys(relationData).length === 0) {
        return { success: true, skipped: true };
      }
      
      // Use documentId for Strapi v5 updates
      const response = await axios.put(`${this.destination.url}/api/${endpoint}/${documentId}`, {
        data: relationData
      }, {
        headers: { 
          Authorization: `Bearer ${this.destinationToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data || error.message,
        status: error.response?.status 
      };
    }
  }

  async migrateContentTypePass1(contentType) {
    console.log(`\n🚀 PASS 1: Migrating ${contentType} (without relations)...`);
    
    const entries = await this.getEntries(contentType);
    if (entries.length === 0) {
      console.log(`   ⚠️  No entries found for ${contentType}`);
      return { success: 0, failed: 0, errors: [], entries: [] };
    }
    
    const results = { success: 0, failed: 0, errors: [], entries: [] };
    let consecutiveFailures = 0;
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`   📝 Creating entry ${i + 1}/${entries.length}...`);
      
      const result = await this.createEntry(contentType, entry);
      
      if (result.success) {
        results.success++;
        consecutiveFailures = 0; // Reset consecutive failures
        console.log(`   ✅ Success - Mapped ${entry.id} -> ${result.data.data.id}`);
        
        // Store mappings
        const oldId = entry.id;
        const newId = result.data.data.id;
        const documentId = result.data.data.documentId;
        const mappingKey = `${contentType}_${oldId}`;
        
        this.idMappings.set(mappingKey, newId);
        this.documentIdMappings.set(mappingKey, documentId);
        
        results.entries.push({
          originalEntry: entry,
          newId: newId,
          documentId: documentId
        });
      } else {
        results.failed++;
        consecutiveFailures++;
        
        results.errors.push({
          index: i + 1,
          error: result.error,
          status: result.status,
          originalId: entry.id
        });
        
        console.log(`   ❌ Failed: ${result.error?.error?.message || result.error?.message || result.error}`);
        
        // Early termination check
        if (consecutiveFailures >= this.maxConsecutiveFailures) {
          console.log(`   ⚠️  ${this.maxConsecutiveFailures} consecutive failures detected. Terminating this content type.`);
          break;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`📊 Pass 1 - ${contentType}: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  async migrateContentTypePass2(contentType, pass1Results) {
    console.log(`\n🔄 PASS 2: Updating ${contentType} relations...`);
    
    if (pass1Results.entries.length === 0) {
      console.log(`   ⚠️  No entries to update for ${contentType}`);
      return { success: 0, failed: 0, errors: [] };
    }
    
    const results = { success: 0, failed: 0, errors: [] };
    let consecutiveFailures = 0;
    
    for (let i = 0; i < pass1Results.entries.length; i++) {
      const { originalEntry, newId, documentId } = pass1Results.entries[i];
      console.log(`   📝 Updating entry ${i + 1}/${pass1Results.entries.length}...`);
      
      const result = await this.updateEntryRelations(contentType, originalEntry, newId, documentId);
      
      if (result.success) {
        results.success++;
        consecutiveFailures = 0;
        if (result.skipped) {
          console.log(`   ⚪ Skipped (no relations)`);
        } else {
          console.log(`   ✅ Success`);
        }
      } else {
        results.failed++;
        consecutiveFailures++;
        
        results.errors.push({
          index: i + 1,
          error: result.error,
          status: result.status,
          entryId: newId
        });
        
        console.log(`   ❌ Failed: ${result.error?.error?.message || result.error?.message || result.error}`);
        
        // Early termination check
        if (consecutiveFailures >= this.maxConsecutiveFailures) {
          console.log(`   ⚠️  ${this.maxConsecutiveFailures} consecutive failures detected. Terminating relations update.`);
          break;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`📊 Pass 2 - ${contentType}: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  async run() {
    console.log('🚀 Improved Strapi v5 Content Migration Starting...');
    console.log('====================================================');
    
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

    console.log('\n📋 PHASE 1: Creating entries without relations');
    console.log('================================================');

    // Pass 1: Create entries without relations
    for (const contentType of migrationOrder) {
      try {
        const result = await this.migrateContentTypePass1(contentType);
        this.results.pass1[contentType] = result;
        this.results.summary.pass1.success += result.success;
        this.results.summary.pass1.failed += result.failed;
        this.results.summary.pass1.total += result.success + result.failed;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to migrate ${contentType}:`, error.message);
      }
    }

    console.log('\n📋 PHASE 2: Updating relations');
    console.log('===============================');

    // Pass 2: Update relations
    for (const contentType of migrationOrder) {
      try {
        const pass1Result = this.results.pass1[contentType];
        if (pass1Result) {
          const result = await this.migrateContentTypePass2(contentType, pass1Result);
          this.results.pass2[contentType] = result;
          this.results.summary.pass2.success += result.success;
          this.results.summary.pass2.failed += result.failed;
          this.results.summary.pass2.total += result.success + result.failed;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to update relations for ${contentType}:`, error.message);
      }
    }

    // Save results
    const resultsPath = path.join(__dirname, 'improved-migration-results.json');
    const mappingsPath = path.join(__dirname, 'improved-id-mappings.json');
    
    fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
    
    const mappingsObj = Object.fromEntries(this.idMappings);
    const docMappingsObj = Object.fromEntries(this.documentIdMappings);
    fs.writeFileSync(mappingsPath, JSON.stringify({
      idMappings: mappingsObj,
      documentIdMappings: docMappingsObj
    }, null, 2));

    console.log('\n🎉 MIGRATION SUMMARY');
    console.log('===================');
    console.log(`Pass 1 - Created: ${this.results.summary.pass1.success} entries`);
    console.log(`Pass 2 - Updated: ${this.results.summary.pass2.success} relations`);
    console.log(`📁 Results saved to: ${resultsPath}`);
    console.log(`🔗 ID mappings saved to: ${mappingsPath}`);

    const totalSuccess = this.results.summary.pass1.success + this.results.summary.pass2.success;
    const totalFailed = this.results.summary.pass1.failed + this.results.summary.pass2.failed;
    
    console.log(`\n📊 Overall: ${totalSuccess} successes, ${totalFailed} failures`);

    return totalFailed === 0;
  }
}

// Run if called directly
if (require.main === module) {
  const migrator = new ImprovedStrapiV5Migrator();
  migrator.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = ImprovedStrapiV5Migrator;
