#!/usr/bin/env node

/**
 * Debug Two-Pass Strapi v5 Migrator - For debugging specific relation issues
 * Processes only a few records with detailed logging
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class DebugMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.idMappings = new Map();
    
    // Content type to endpoint mapping
    this.contentTypeEndpoints = {
      'api::tag-label.tag-label': 'tag-labels',
      'api::stay.stay': 'stays',
      'api::poi.poi': 'pois',
      'api::suite.suite': 'suites',
      'api::poi-recommendation.poi-recommendation': 'poi-recommendations',
      'api::hub-application-config.hub-application-config': 'hub-application-config'
    };
    
    this.singleTypes = new Set(['api::hub-application-config.hub-application-config']);
    
    // Limit records for debug
    this.DEBUG_LIMIT = 2;
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
      const mappingPath = path.join(__dirname, 'backup/media-mapping.json');
      if (fs.existsSync(mappingPath)) {
        const data = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        this.mediaMapping = new Map(Object.entries(data.mapping));
        console.log(`📁 Loaded ${this.mediaMapping.size} media mappings`);
      }
    } catch (error) {
      console.warn('⚠️  Could not load media mapping:', error.message);
    }
  }

  logDebugData(title, data) {
    console.log(`\n🔍 DEBUG: ${title}`);
    console.log('─'.repeat(50));
    console.log(JSON.stringify(data, null, 2));
    console.log('─'.repeat(50));
  }

  // Clean entry data - remove relations for pass 1
  cleanEntryDataPass1(entry) {
    const cleaned = { ...entry };
    
    // Remove system fields
    delete cleaned.id;
    delete cleaned.documentId;
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    delete cleaned.publishedAt;
    delete cleaned.createdBy;
    delete cleaned.updatedBy;
    delete cleaned.localizations;
    
    // Remove all relations for pass 1
    delete cleaned.tag_labels;
    delete cleaned.ownedBy;
    delete cleaned.poi;
    delete cleaned.recommendedBy;
    delete cleaned.recommended_by;
    delete cleaned.pickedPOIs;
    
    // Process media fields only
    this.processMediaFields(cleaned);
    
    this.logDebugData(`Pass 1 cleaned data`, cleaned);
    return cleaned;
  }

  // Clean entry data - process relations for pass 2
  cleanEntryDataPass2(entry, contentType) {
    console.log(`\n🔄 Pass 2 processing for ${contentType}...`);
    this.logDebugData(`Original entry data`, entry);
    
    const cleaned = { ...entry };
    
    // Remove system fields
    delete cleaned.id;
    delete cleaned.documentId;
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    delete cleaned.publishedAt;
    delete cleaned.createdBy;
    delete cleaned.updatedBy;
    delete cleaned.localizations;
    
    // Process media and relations
    this.processFields(cleaned, contentType);
    
    this.logDebugData(`Pass 2 cleaned data`, cleaned);
    return cleaned;
  }

  processMediaFields(data) {
    console.log(`\n📸 Processing media fields...`);
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (Array.isArray(value)) {
        console.log(`Processing array field: ${key}`);
        data[key] = value.map(item => {
          if (item && typeof item === 'object' && item.id && (item.url || item.mime)) {
            console.log(`  Media item found - ID: ${item.id}, URL: ${item.url}`);
            const mappedId = this.mediaMapping.get(item.id.toString());
            console.log(`  Mapped to: ${mappedId || 'NOT FOUND'}`);
            return mappedId ? parseInt(mappedId) : item.id;
          }
          return item;
        });
      } else if (value && typeof value === 'object') {
        if (value.id && (value.url || value.mime)) {
          console.log(`Processing media field: ${key} - ID: ${value.id}, URL: ${value.url}`);
          const mappedId = this.mediaMapping.get(value.id.toString());
          console.log(`  Mapped to: ${mappedId || 'NOT FOUND'}`);
          data[key] = mappedId ? parseInt(mappedId) : value.id;
        } else {
          this.processMediaFields(value);
        }
      }
    }
  }

  processFields(data, contentType) {
    console.log(`\n🔗 Processing all fields for ${contentType}...`);
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      console.log(`Processing field: ${key}`);
      
      if (Array.isArray(value)) {
        console.log(`  Array field with ${value.length} items`);
        data[key] = value.map((item, index) => {
          if (item && typeof item === 'object') {
            if (item.id && (item.url || item.mime)) {
              console.log(`    Item ${index}: Media - ID: ${item.id}`);
              const mappedId = this.mediaMapping.get(item.id.toString());
              console.log(`      Mapped to: ${mappedId || 'NOT FOUND'}`);
              return mappedId ? parseInt(mappedId) : item.id;
            } else if (item.id) {
              console.log(`    Item ${index}: Relation - ID: ${item.id}`);
              const relationContentType = this.getContentTypeFromRelation(key);
              const mappingKey = `${relationContentType}_${item.id}`;
              const mappedId = this.idMappings.get(mappingKey);
              console.log(`      Content type: ${relationContentType}`);
              console.log(`      Mapping key: ${mappingKey}`);
              console.log(`      Mapped to: ${mappedId || 'NOT FOUND'}`);
              return mappedId ? mappedId : item.id;
            }
          }
          return item;
        });
      } else if (value && typeof value === 'object') {
        if (value.id && (value.url || value.mime)) {
          console.log(`  Single media - ID: ${value.id}`);
          const mappedId = this.mediaMapping.get(value.id.toString());
          console.log(`    Mapped to: ${mappedId || 'NOT FOUND'}`);
          data[key] = mappedId ? parseInt(mappedId) : value.id;
        } else if (value.id) {
          console.log(`  Single relation - ID: ${value.id}`);
          const relationContentType = this.getContentTypeFromRelation(key);
          const mappingKey = `${relationContentType}_${value.id}`;
          const mappedId = this.idMappings.get(mappingKey);
          console.log(`    Content type: ${relationContentType}`);
          console.log(`    Mapping key: ${mappingKey}`);
          console.log(`    Mapped to: ${mappedId || 'NOT FOUND'}`);
          data[key] = mappedId ? mappedId : value.id;
        } else {
          this.processFields(value, contentType);
        }
      }
    }
  }

  getContentTypeFromRelation(fieldName) {
    const relationMappings = {
      'tag_labels': 'api::tag-label.tag-label',
      'ownedBy': 'api::stay.stay',
      'poi': 'api::poi.poi',
      'recommendedBy': 'api::stay.stay',
      'recommended_by': 'api::stay.stay',
      'pickedPOIs': 'api::poi.poi',
      'coverPhoto': 'media',
      'avatar': 'media'
    };
    return relationMappings[fieldName] || 'unknown';
  }

  async getEntries(contentType) {
    console.log(`📥 Fetching entries for ${contentType} (DEBUG LIMIT: ${this.DEBUG_LIMIT})...`);
    
    const endpoint = this.contentTypeEndpoints[contentType];
    if (!endpoint) {
      console.error(`❌ Unknown content type: ${contentType}`);
      return [];
    }
    
    try {
      const response = await axios.get(`${this.source.url}/api/${endpoint}`, {
        headers: { Authorization: `Bearer ${this.sourceToken}` },
        params: { 
          'populate': '*',
          'pagination[page]': 1,
          'pagination[pageSize]': this.DEBUG_LIMIT
        }
      });

      const entries = response.data.data;
      console.log(`   📄 Debug entries found: ${entries.length}`);
      
      // Log the raw entries for debugging
      entries.forEach((entry, index) => {
        this.logDebugData(`Raw entry ${index + 1}`, entry);
      });
      
      return entries;
    } catch (error) {
      console.error(`❌ Error fetching ${contentType}:`, error.response?.data || error.message);
      return [];
    }
  }

  async createEntry(contentType, entryData, isPass2 = false) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      if (!endpoint) {
        throw new Error(`Unknown content type: ${contentType}`);
      }
      
      const cleanedData = isPass2 ? 
        this.cleanEntryDataPass2(entryData, contentType) : 
        this.cleanEntryDataPass1(entryData);
      
      console.log(`\n📤 Creating entry for ${contentType}...`);
      this.logDebugData(`Request payload`, { data: cleanedData });
      
      const response = await axios.post(`${this.destination.url}/api/${endpoint}`, {
        data: cleanedData
      }, {
        headers: { 
          Authorization: `Bearer ${this.destinationToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Entry created successfully`);
      this.logDebugData(`Response data`, response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.log(`❌ Entry creation failed`);
      this.logDebugData(`Error response`, error.response?.data || error.message);
      return { 
        success: false, 
        error: error.response?.data || error.message,
        status: error.response?.status 
      };
    }
  }

  async updateEntry(contentType, documentId, entryData) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      if (!endpoint) {
        throw new Error(`Unknown content type: ${contentType}`);
      }
      
      const cleanedData = this.cleanEntryDataPass2(entryData, contentType);
      
      console.log(`\n📤 Updating entry with documentId ${documentId} for ${contentType}...`);
      this.logDebugData(`Update payload`, { data: cleanedData });
      
      // For Strapi v5, we need to use documentId in the URL path
      const response = await axios.put(`${this.destination.url}/api/${endpoint}/${documentId}`, {
        data: cleanedData
      }, {
        headers: { 
          Authorization: `Bearer ${this.destinationToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Entry updated successfully`);
      this.logDebugData(`Response data`, response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.log(`❌ Entry update failed`);
      this.logDebugData(`Error response`, error.response?.data || error.message);
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
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`\n📝 Creating entry ${i + 1}/${entries.length}...`);
      
      const result = await this.createEntry(contentType, entry, false);
      
      if (result.success) {
        results.success++;
        const oldId = entry.id;
        const newId = result.data.data.id;
        const documentId = result.data.data.documentId;
        const mappingKey = `${contentType}_${oldId}`;
        this.idMappings.set(mappingKey, newId);
        results.entries.push({ originalEntry: entry, newId: newId, documentId: documentId });
        console.log(`   ✅ Success - Mapped ${oldId} -> ${newId} (documentId: ${documentId})`);
        
        // Log the mapping for debugging
        console.log(`🗂️  ID Mapping added: ${mappingKey} -> ${newId}`);
      } else {
        results.failed++;
        results.errors.push({
          index: i + 1,
          error: result.error,
          status: result.status,
          originalId: entry.id
        });
        console.log(`   ❌ Failed: ${JSON.stringify(result.error, null, 2)}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`📊 Pass 1 - ${contentType}: ${results.success} success, ${results.failed} failed`);
    
    // Log current ID mappings
    console.log(`\n🗂️  Current ID Mappings:`);
    for (const [key, value] of this.idMappings.entries()) {
      console.log(`   ${key} -> ${value}`);
    }
    
    return results;
  }

  async migrateContentTypePass2(contentType, pass1Results) {
    if (!pass1Results.entries || pass1Results.entries.length === 0) {
      console.log(`\n⚠️  PASS 2: No entries to update for ${contentType}`);
      return { success: 0, failed: 0, errors: [] };
    }

    console.log(`\n🔄 PASS 2: Updating ${contentType} relations...`);
    
    const results = { success: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < pass1Results.entries.length; i++) {
      const { originalEntry, newId, documentId } = pass1Results.entries[i];
      console.log(`\n📝 Updating entry ${i + 1}/${pass1Results.entries.length} (ID: ${newId}, documentId: ${documentId})...`);
      
      const result = await this.updateEntry(contentType, documentId, originalEntry);
      
      if (result.success) {
        results.success++;
        console.log(`   ✅ Relations updated`);
      } else {
        results.failed++;
        results.errors.push({
          index: i + 1,
          error: result.error,
          status: result.status,
          entryId: newId
        });
        console.log(`   ❌ Failed: ${JSON.stringify(result.error, null, 2)}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`📊 Pass 2 - ${contentType}: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  async run() {
    console.log('🚀 Debug Two-Pass Strapi v5 Content Migration Starting...');
    console.log('========================================================');
    console.log(`🔍 DEBUG MODE: Processing only ${this.DEBUG_LIMIT} records per content type`);
    console.log('========================================================');
    
    await this.authenticate();
    this.loadMediaMapping();
    
    // PASS 1: Migrate without relations
    console.log('\n📋 PHASE 1: Creating entries without relations');
    console.log('================================================');
    
    const migrationOrder = [
      'api::tag-label.tag-label',
      'api::stay.stay',
      'api::poi.poi'
    ];

    const results = {
      pass1: {},
      pass2: {}
    };

    for (const contentType of migrationOrder) {
      try {
        const result = await this.migrateContentTypePass1(contentType);
        results.pass1[contentType] = result;
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Pass 1 failed for ${contentType}:`, error.message);
      }
    }

    // PASS 2: Update relations
    console.log('\n📋 PHASE 2: Updating relations');
    console.log('===============================');
    
    for (const contentType of migrationOrder) {
      try {
        const pass1Result = results.pass1[contentType];
        const result = await this.migrateContentTypePass2(contentType, pass1Result);
        results.pass2[contentType] = result;
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Pass 2 failed for ${contentType}:`, error.message);
      }
    }

    // Save debug results
    const resultsPath = path.join(__dirname, 'debug-migration-results.json');
    const mappingsPath = path.join(__dirname, 'debug-id-mappings.json');
    
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    const mappingsObj = Object.fromEntries(this.idMappings);
    fs.writeFileSync(mappingsPath, JSON.stringify(mappingsObj, null, 2));

    console.log('\n🎉 DEBUG MIGRATION SUMMARY');
    console.log('==========================');
    console.log(`📁 Results saved to: ${resultsPath}`);
    console.log(`🔗 ID mappings saved to: ${mappingsPath}`);

    return results;
  }
}

if (require.main === module) {
  const migrator = new DebugMigrator();
  migrator.run()
    .then(results => {
      console.log('\n✅ Debug migration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Debug migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = DebugMigrator;
