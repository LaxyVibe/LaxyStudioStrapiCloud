#!/usr/bin/env node

/**
 * Two-Pass Strapi v5 Migrator - Handles circular dependencies
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class TwoPassMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.idMappings = new Map();
    this.results = {
      pass1: {},
      pass2: {},
      summary: { pass1: { total: 0, success: 0, failed: 0 }, pass2: { total: 0, success: 0, failed: 0 } }
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
    
    this.singleTypes = new Set(['api::hub-application-config.hub-application-config']);
    
    // Content types that can be migrated without relations first
    this.independentTypes = ['api::tag-label.tag-label'];
    this.dependentTypes = ['api::stay.stay', 'api::poi.poi', 'api::suite.suite', 'api::poi-recommendation.poi-recommendation'];
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
    
    // Remove all relations for pass 1 - we'll add them in pass 2
    delete cleaned.tag_labels;
    delete cleaned.ownedBy;
    delete cleaned.poi;
    delete cleaned.recommendedBy;
    delete cleaned.recommended_by;
    delete cleaned.pickedPOIs;
    
    // Process media fields only
    this.processMediaFields(cleaned);
    
    return cleaned;
  }

  // Clean entry data - process relations for pass 2
  cleanEntryDataPass2(entry, contentType) {
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
    
    return cleaned;
  }

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
      } else if (value && typeof value === 'object') {
        if (value.id && (value.url || value.mime)) {
          const mappedId = this.mediaMapping.get(value.id.toString());
          data[key] = mappedId ? parseInt(mappedId) : value.id;
        } else {
          this.processMediaFields(value);
        }
      }
    }
  }

  processFields(data, contentType) {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (Array.isArray(value)) {
        data[key] = value.map(item => {
          if (item && typeof item === 'object') {
            if (item.id && (item.url || item.mime)) {
              const mappedId = this.mediaMapping.get(item.id.toString());
              return mappedId ? parseInt(mappedId) : item.id;
            } else if (item.id) {
              const mappingKey = `${this.getContentTypeFromRelation(key)}_${item.id}`;
              const mappedId = this.idMappings.get(mappingKey);
              return mappedId ? mappedId : item.id;
            }
          }
          return item;
        });
      } else if (value && typeof value === 'object') {
        if (value.id && (value.url || value.mime)) {
          const mappedId = this.mediaMapping.get(value.id.toString());
          data[key] = mappedId ? parseInt(mappedId) : value.id;
        } else if (value.id) {
          const mappingKey = `${this.getContentTypeFromRelation(key)}_${value.id}`;
          const mappedId = this.idMappings.get(mappingKey);
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
        
        if (!entries || entries.length === 0) break;
        
        allEntries = allEntries.concat(entries);
        console.log(`   📄 Page ${page}: ${entries.length} entries (Total: ${allEntries.length})`);
        
        if (!pagination || page >= pagination.pageCount || entries.length < pageSize) break;
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

  async createEntry(contentType, entryData, isPass2 = false) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      if (!endpoint) {
        throw new Error(`Unknown content type: ${contentType}`);
      }
      
      const cleanedData = isPass2 ? 
        this.cleanEntryDataPass2(entryData, contentType) : 
        this.cleanEntryDataPass1(entryData);
      
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

  async updateEntry(contentType, entryId, entryData) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      if (!endpoint) {
        throw new Error(`Unknown content type: ${contentType}`);
      }
      
      const cleanedData = this.cleanEntryDataPass2(entryData, contentType);
      
      const response = await axios.put(`${this.destination.url}/api/${endpoint}/${entryId}`, {
        data: cleanedData
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
      return { success: 0, failed: 0, errors: [] };
    }
    
    const results = { success: 0, failed: 0, errors: [], entries: [] };
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`   📝 Creating entry ${i + 1}/${entries.length}...`);
      
      const result = await this.createEntry(contentType, entry, false);
      
      if (result.success) {
        results.success++;
        const oldId = entry.id;
        const newId = result.data.data.id;
        const mappingKey = `${contentType}_${oldId}`;
        this.idMappings.set(mappingKey, newId);
        results.entries.push({ originalEntry: entry, newId: newId });
        console.log(`   ✅ Success - Mapped ${oldId} -> ${newId}`);
      } else {
        results.failed++;
        results.errors.push({
          index: i + 1,
          error: result.error,
          status: result.status,
          originalId: entry.id
        });
        console.log(`   ❌ Failed: ${result.error?.error?.message || result.error?.message || result.error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`📊 Pass 1 - ${contentType}: ${results.success} success, ${results.failed} failed`);
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
      const { originalEntry, newId } = pass1Results.entries[i];
      console.log(`   📝 Updating entry ${i + 1}/${pass1Results.entries.length}...`);
      
      const result = await this.updateEntry(contentType, newId, originalEntry);
      
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
        console.log(`   ❌ Failed: ${result.error?.error?.message || result.error?.message || result.error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`📊 Pass 2 - ${contentType}: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  async run() {
    console.log('🚀 Two-Pass Strapi v5 Content Migration Starting...');
    console.log('=====================================================');
    
    await this.authenticate();
    this.loadMediaMapping();
    
    // PASS 1: Migrate without relations
    console.log('\n📋 PHASE 1: Creating entries without relations');
    console.log('================================================');
    
    const migrationOrder = [
      'api::tag-label.tag-label',
      'api::stay.stay',
      'api::poi.poi',
      'api::suite.suite',
      'api::poi-recommendation.poi-recommendation'
    ];

    for (const contentType of migrationOrder) {
      try {
        const result = await this.migrateContentTypePass1(contentType);
        this.results.pass1[contentType] = result;
        this.results.summary.pass1.success += result.success;
        this.results.summary.pass1.failed += result.failed;
        this.results.summary.pass1.total += result.success + result.failed;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Pass 1 failed for ${contentType}:`, error.message);
      }
    }

    // PASS 2: Update relations
    console.log('\n📋 PHASE 2: Updating relations');
    console.log('===============================');
    
    for (const contentType of migrationOrder) {
      try {
        const pass1Result = this.results.pass1[contentType];
        const result = await this.migrateContentTypePass2(contentType, pass1Result);
        this.results.pass2[contentType] = result;
        this.results.summary.pass2.success += result.success;
        this.results.summary.pass2.failed += result.failed;
        this.results.summary.pass2.total += result.success + result.failed;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Pass 2 failed for ${contentType}:`, error.message);
      }
    }

    // Save results
    const resultsPath = path.join(__dirname, 'two-pass-migration-results.json');
    const mappingsPath = path.join(__dirname, 'two-pass-id-mappings.json');
    
    fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
    const mappingsObj = Object.fromEntries(this.idMappings);
    fs.writeFileSync(mappingsPath, JSON.stringify(mappingsObj, null, 2));

    console.log('\n🎉 MIGRATION SUMMARY');
    console.log('===================');
    console.log(`Pass 1 - Created: ${this.results.summary.pass1.success} entries`);
    console.log(`Pass 2 - Updated: ${this.results.summary.pass2.success} relations`);
    console.log(`📁 Results saved to: ${resultsPath}`);
    console.log(`🔗 ID mappings saved to: ${mappingsPath}`);

    return this.results.summary.pass1.failed === 0 && this.results.summary.pass2.failed === 0;
  }
}

if (require.main === module) {
  const migrator = new TwoPassMigrator();
  migrator.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = TwoPassMigrator;
