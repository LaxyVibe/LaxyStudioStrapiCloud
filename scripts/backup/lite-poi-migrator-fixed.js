#!/usr/bin/env node

/**
 * Lite POI Migrator - FIXED VERSION
 * Test migration of 5 POIs with all localizations and relations
 * Fixed: Tag-label fetching, relation processing, and slug handling
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class LitePOIMigratorFixed {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.idMappings = new Map();
    this.documentIdMappings = new Map();
    this.results = {
      locales: {},
      summary: { total: 0, success: 0, failed: 0 }
    };
    
    // Supported locales
    this.locales = ['en', 'zh-Hans', 'zh-Hant', 'ko', 'ja'];
    this.defaultLocale = 'en';
    
    // Test limits
    this.maxPOIs = 5;
    this.maxTagLabels = 10;
    
    // Content type to endpoint mapping
    this.contentTypeEndpoints = {
      'api::tag-label.tag-label': 'tag-labels',
      'api::poi.poi': 'pois'
    };
    
    // Migration order - dependencies first
    this.migrationOrder = [
      'api::tag-label.tag-label',
      'api::poi.poi'
    ];
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
      const mappingPath = path.join(__dirname, 'mediaMappings.json');
      if (fs.existsSync(mappingPath)) {
        const data = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        this.mediaMapping = new Map(Object.entries(data));
        console.log(`📁 Loaded ${this.mediaMapping.size} media mappings`);
      }
    } catch (error) {
      console.warn('⚠️  Could not load media mapping:', error.message);
    }
  }

  // Get all entries for default locale with better error handling
  async getAllDefaultLocaleEntries(contentType) {
    console.log(`📥 Fetching ${contentType} entries with localizations...`);
    
    const endpoint = this.contentTypeEndpoints[contentType];
    if (!endpoint) {
      console.error(`❌ Unknown content type: ${contentType}`);
      return [];
    }
    
    let allEntries = [];
    let page = 1;
    const pageSize = 25;
    const maxEntries = contentType === 'api::poi.poi' ? this.maxPOIs : this.maxTagLabels;
    
    while (allEntries.length < maxEntries) {
      try {
        console.log(`   🔄 Fetching page ${page}...`);
        
        const response = await axios.get(`${this.source.url}/api/${endpoint}`, {
          headers: { Authorization: `Bearer ${this.sourceToken}` },
          params: {
            'pagination[page]': page,
            'pagination[pageSize]': pageSize,
            'populate': '*',
            'locale': this.defaultLocale
          },
          timeout: 60000 // Increase timeout to 60 seconds
        });

        const entries = response.data.data;
        const pagination = response.data.meta?.pagination;
        
        if (!entries || entries.length === 0) {
          if (page === 1) {
            console.log(`   ⚪ No entries found for ${contentType}`);
          }
          break;
        }
        
        // Limit entries for testing
        const remainingSlots = maxEntries - allEntries.length;
        const entriesToAdd = entries.slice(0, remainingSlots);
        allEntries = allEntries.concat(entriesToAdd);
        
        console.log(`   📄 Page ${page}: ${entriesToAdd.length} entries (Total: ${allEntries.length})`);
        
        if (allEntries.length >= maxEntries || !pagination || page >= pagination.pageCount || entries.length < pageSize) {
          break;
        }
        
        page++;
        await new Promise(resolve => setTimeout(resolve, 500)); // Increase delay
      } catch (error) {
        console.error(`❌ Error fetching ${contentType} page ${page}:`, error.response?.data || error.message);
        if (error.code === 'ECONNABORTED') {
          console.log(`   ⏱️  Request timed out, retrying with longer timeout...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue; // Retry the same page
        }
        break;
      }
    }
    
    console.log(`   📊 Found ${allEntries.length} ${contentType} entries (limited to ${maxEntries} for testing)`);
    
    // Log entries for debugging
    if (allEntries.length > 0) {
      console.log(`   🎯 Testing with entries:`);
      allEntries.forEach((entry, index) => {
        const localizationCount = entry.localizations ? entry.localizations.length : 0;
        const entryName = entry.name || entry.label || `Entry ${entry.id}`;
        console.log(`     ${index + 1}. "${entryName}" (ID: ${entry.id}) - ${localizationCount} localizations`);
      });
    }
    
    return allEntries;
  }

  // Clean entry data for migration with improved slug handling
  cleanEntryData(entry, phase = 'creation') {
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
    
    // Improved slug uniqueness handling for localizations
    if (cleaned.slug && cleaned.locale && cleaned.locale !== this.defaultLocale) {
      // Create more unique slugs to avoid conflicts
      const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
      if (cleaned.locale === 'zh-Hans' || cleaned.locale === 'zh-Hant') {
        cleaned.slug = `${cleaned.slug}-${cleaned.locale.toLowerCase().replace('-', '')}-${timestamp}`;
      } else {
        cleaned.slug = `${cleaned.slug}-${cleaned.locale}-${timestamp}`;
      }
    }
    
    if (phase === 'creation') {
      // For creation phase, remove relations
      this.removeRelationFields(cleaned);
    } else {
      // For relation phase, only keep relation fields
      this.keepOnlyRelationFields(cleaned);
    }
    
    // Process media fields
    this.processMediaFields(cleaned);
    
    // Deep clean system fields
    this.deepCleanSystemFields(cleaned);
    
    return cleaned;
  }

  // Remove relation fields
  removeRelationFields(data) {
    const relationFields = ['pickedPOIs', 'tag_labels', 'ownedBy', 'poi', 'recommendedBy'];
    relationFields.forEach(field => {
      delete data[field];
    });
    
    // Remove nested objects that look like relations
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.id !== undefined && !value.url && !value.mime) {
          delete data[key];
        }
      } else if (Array.isArray(value)) {
        const hasRelations = value.some(item => 
          item && typeof item === 'object' && item.id !== undefined && !item.url && !item.mime
        );
        if (hasRelations) {
          delete data[key];
        }
      }
    }
  }

  // Keep only relation fields with ID conversion
  keepOnlyRelationFields(data) {
    const relationFields = ['pickedPOIs', 'tag_labels', 'ownedBy', 'poi', 'recommendedBy'];
    const relationData = {};
    
    relationFields.forEach(field => {
      if (data[field] !== undefined) {
        // Convert relation objects to IDs if needed
        if (Array.isArray(data[field])) {
          relationData[field] = data[field].map(item => {
            if (item && typeof item === 'object' && item.id) {
              return item.id; // Extract ID from object
            }
            return item; // Keep as-is if already an ID
          });
        } else if (data[field] && typeof data[field] === 'object' && data[field].id) {
          relationData[field] = data[field].id; // Extract ID from object
        } else {
          relationData[field] = data[field]; // Keep as-is
        }
      }
    });
    
    // Clear original data and copy only relations
    Object.keys(data).forEach(key => delete data[key]);
    Object.assign(data, relationData);
  }

  // Process media fields
  processMediaFields(data) {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      
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

  // Get content type from relation field name
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

  // Process relation fields with proper ID mapping
  processRelationFields(data, locale, currentContentType) {
    console.log(`     🔍 Processing relations for ${currentContentType} in ${locale} locale...`);
    
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      
      if (Array.isArray(value)) {
        console.log(`       📋 Processing array relation ${key} with ${value.length} items...`);
        const originalCount = value.length;
        
        data[key] = value.map(item => {
          if (typeof item === 'number') {
            // Handle direct ID references
            const relatedContentType = this.getContentTypeFromRelation(key);
            if (relatedContentType !== 'unknown') {
              const mappingKey = `${relatedContentType}_${item}`;
              const mappedId = this.idMappings.get(mappingKey);
              console.log(`         🔗 ID ${item} -> ${mappedId || 'UNMAPPED'}`);
              return mappedId || null;
            }
            return item;
          } else if (item && typeof item === 'object' && item.id) {
            // Handle object relations
            const relatedContentType = this.getContentTypeFromRelation(key);
            if (relatedContentType !== 'unknown') {
              const mappingKey = `${relatedContentType}_${item.id}`;
              const mappedId = this.idMappings.get(mappingKey);
              console.log(`         🔗 Object ID ${item.id} -> ${mappedId || 'UNMAPPED'}`);
              return mappedId || null;
            }
            return item;
          }
          return item;
        }).filter(item => item !== null);
        
        const newCount = data[key].length;
        console.log(`       📊 ${key}: ${originalCount} -> ${newCount} relations (removed ${originalCount - newCount} unmapped)`);
        
      } else if (typeof value === 'number') {
        // Handle single ID relations
        const relatedContentType = this.getContentTypeFromRelation(key);
        if (relatedContentType !== 'unknown') {
          const mappingKey = `${relatedContentType}_${value}`;
          const mappedId = this.idMappings.get(mappingKey);
          console.log(`       🔗 Single ID ${key}: ${value} -> ${mappedId || 'UNMAPPED'}`);
          
          if (mappedId) {
            data[key] = mappedId;
          } else {
            delete data[key]; // Remove unmapped relations
          }
        }
      } else if (value && typeof value === 'object' && value.id) {
        // Handle single object relations
        const relatedContentType = this.getContentTypeFromRelation(key);
        if (relatedContentType !== 'unknown') {
          const mappingKey = `${relatedContentType}_${value.id}`;
          const mappedId = this.idMappings.get(mappingKey);
          console.log(`       🔗 Single Object ${key}: ${value.id} -> ${mappedId || 'UNMAPPED'}`);
          
          if (mappedId) {
            data[key] = mappedId;
          } else {
            delete data[key]; // Remove unmapped relations
          }
        }
      }
    }
  }

  // Deep clean system fields
  deepCleanSystemFields(obj) {
    if (!obj || typeof obj !== 'object') return;
    
    const systemFields = ['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'createdBy', 'updatedBy', 'localizations'];
    
    if (Array.isArray(obj)) {
      obj.forEach(item => this.deepCleanSystemFields(item));
    } else {
      systemFields.forEach(field => delete obj[field]);
      Object.values(obj).forEach(value => this.deepCleanSystemFields(value));
    }
  }

  // Create or update entry
  async createOrUpdateEntry(contentType, entryData, locale, documentId = null, phase = 'creation') {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      const isDefaultLocale = locale === this.defaultLocale;
      const cleanedData = this.cleanEntryData(entryData, phase);
      
      // Process relations for relation phase
      if (phase === 'relations') {
        this.processRelationFields(cleanedData, locale, contentType);
        
        // Skip if no relations to process
        if (Object.keys(cleanedData).length === 0) {
          console.log(`     ⏭️  No relations to process for ${locale}`);
          return { success: true, skipped: true };
        }
        
        console.log(`     🔗 Updating relations with data:`, JSON.stringify(cleanedData, null, 2));
      }
      
      // Set locale for non-default locales
      if (!isDefaultLocale && phase === 'creation') {
        cleanedData.locale = locale;
      }
      
      // Handle collection types
      if (documentId && !isDefaultLocale && phase === 'creation') {
        // Create localization for existing document
        const response = await axios.put(`${this.destination.url}/api/${endpoint}/${documentId}?locale=${locale}`, {
          data: cleanedData
        }, {
          headers: { 
            Authorization: `Bearer ${this.destinationToken}`,
            'Content-Type': 'application/json'
          }
        });
        return { success: true, data: response.data };
      } else if (documentId && phase === 'relations') {
        // Update relations for existing document
        const response = await axios.put(`${this.destination.url}/api/${endpoint}/${documentId}?locale=${locale}`, {
          data: cleanedData
        }, {
          headers: { 
            Authorization: `Bearer ${this.destinationToken}`,
            'Content-Type': 'application/json'
          }
        });
        return { success: true, data: response.data };
      } else {
        // Create new document (default locale)
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

  // Migrate content type with comprehensive logging
  async migrateContentType(contentType) {
    console.log(`\n🚀 Starting lite migration for ${contentType}...`);
    
    // Initialize results
    if (!this.results.locales[contentType]) {
      this.results.locales[contentType] = {};
      this.locales.forEach(locale => {
        this.results.locales[contentType][locale] = {
          success: 0, failed: 0, errors: [], entries: []
        };
      });
    }
    
    // Phase 1: Get entries
    const defaultEntries = await this.getAllDefaultLocaleEntries(contentType);
    if (defaultEntries.length === 0) {
      console.log(`⚪ No entries found for ${contentType}`);
      return;
    }
    
    // Phase 2: Create default locale entries
    console.log(`\n📝 Phase 1: Creating default locale (${this.defaultLocale}) entries...`);
    const defaultResults = this.results.locales[contentType][this.defaultLocale];
    
    for (let i = 0; i < defaultEntries.length; i++) {
      const entry = defaultEntries[i];
      const entryName = entry.name || entry.label || `Entry ${entry.id}`;
      console.log(`   Creating entry ${i + 1}/${defaultEntries.length}: "${entryName}" (ID: ${entry.id})...`);
      
      const result = await this.createOrUpdateEntry(contentType, entry, this.defaultLocale, null, 'creation');
      
      if (result.success && !result.skipped) {
        defaultResults.success++;
        const newEntry = result.data.data;
        defaultResults.entries.push({
          originalEntry: entry,
          newEntry: newEntry
        });
        
        // Store mappings
        this.idMappings.set(`${contentType}_${entry.id}`, newEntry.id);
        if (newEntry.documentId) {
          this.documentIdMappings.set(`${contentType}_${entry.id}`, newEntry.documentId);
          this.documentIdMappings.set(`${entry.id}_${this.defaultLocale}`, newEntry.documentId);
        }
        
        console.log(`     ✅ Created with new ID: ${newEntry.id}${newEntry.documentId ? ` (documentId: ${newEntry.documentId})` : ''}`);
      } else {
        defaultResults.failed++;
        defaultResults.errors.push({
          originalId: entry.id,
          error: result.error
        });
        console.log(`     ❌ Failed:`, result.error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Phase 3: Create localizations
    console.log(`\n📝 Phase 2: Creating localizations for other locales...`);
    
    for (const entry of defaultEntries) {
      if (!entry.localizations || entry.localizations.length === 0) {
        continue;
      }
      
      const documentId = this.documentIdMappings.get(`${entry.id}_${this.defaultLocale}`);
      if (!documentId) {
        console.log(`   ⚠️  No documentId found for entry ${entry.id}, skipping localizations`);
        continue;
      }
      
      const entryName = entry.name || entry.label || `Entry ${entry.id}`;
      console.log(`   Processing localizations for "${entryName}" (documentId: ${documentId})...`);
      
      for (const localization of entry.localizations) {
        const locale = localization.locale;
        if (!this.locales.includes(locale)) {
          console.log(`     ⚠️  Unsupported locale: ${locale}, skipping`);
          continue;
        }
        
        const localizedName = localization.name || localization.label || `Localized ${localization.id}`;
        console.log(`     Creating ${locale} localization: "${localizedName}" (ID: ${localization.id})...`);
        
        const result = await this.createOrUpdateEntry(contentType, localization, locale, documentId, 'creation');
        const localeResults = this.results.locales[contentType][locale];
        
        if (result.success && !result.skipped) {
          localeResults.success++;
          const newEntry = result.data.data;
          localeResults.entries.push({
            originalEntry: localization,
            newEntry: newEntry
          });
          
          this.idMappings.set(`${contentType}_${localization.id}`, newEntry.id);
          console.log(`       ✅ Created with new ID: ${newEntry.id}`);
        } else {
          localeResults.failed++;
          localeResults.errors.push({
            originalId: localization.id,
            error: result.error
          });
          console.log(`       ❌ Failed:`, result.error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Phase 4: Update relations
    console.log(`\n📝 Phase 3: Updating relations for all locales...`);
    
    // Update relations for default locale entries
    for (const entryResult of defaultResults.entries) {
      const entry = entryResult.originalEntry;
      const newEntry = entryResult.newEntry;
      const entryName = entry.name || entry.label || `Entry ${entry.id}`;
      
      console.log(`   Updating relations for ${this.defaultLocale} entry: "${entryName}"...`);
      
      const result = await this.createOrUpdateEntry(contentType, entry, this.defaultLocale, newEntry.documentId, 'relations');
      if (result.success && !result.skipped) {
        console.log(`     ✅ Updated relations for ${this.defaultLocale} entry ${newEntry.id}`);
      } else if (!result.skipped) {
        console.log(`     ⚠️  Failed to update relations for ${this.defaultLocale} entry ${newEntry.id}:`, result.error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Update relations for localized entries
    for (const entry of defaultEntries) {
      if (!entry.localizations || entry.localizations.length === 0) {
        continue;
      }
      
      const documentId = this.documentIdMappings.get(`${entry.id}_${this.defaultLocale}`);
      if (!documentId) continue;
      
      for (const localization of entry.localizations) {
        const locale = localization.locale;
        if (!this.locales.includes(locale)) continue;
        
        const localizedName = localization.name || localization.label || `Localized ${localization.id}`;
        console.log(`   Updating relations for ${locale} localization: "${localizedName}"...`);
        
        const result = await this.createOrUpdateEntry(contentType, localization, locale, documentId, 'relations');
        if (result.success && !result.skipped) {
          console.log(`     ✅ Updated relations for ${locale} localization`);
        } else if (!result.skipped) {
          console.log(`     ⚠️  Failed to update relations for ${locale} localization:`, result.error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  // Generate detailed summary
  generateSummary() {
    console.log(`\n📊 DETAILED MIGRATION SUMMARY`);
    console.log(`===============================\n`);

    for (const contentType of this.migrationOrder) {
      const typeResults = this.results.locales[contentType];
      if (!typeResults) continue;

      const displayName = contentType.split('.').pop();
      console.log(`🔷 ${contentType}:`);

      for (const locale of this.locales) {
        const localeResult = typeResults[locale];
        if (localeResult.success > 0 || localeResult.failed > 0) {
          console.log(`   ${locale}: ${localeResult.success} success, ${localeResult.failed} failed`);
          
          if (localeResult.entries.length > 0) {
            console.log(`     Entries:`);
            localeResult.entries.forEach((entryResult, index) => {
              const original = entryResult.originalEntry;
              const created = entryResult.newEntry;
              const name = original.name || original.label || `Entry ${original.id}`;
              console.log(`       ${index + 1}. "${name}" (${original.id} -> ${created.id})`);
            });
          }
          
          if (localeResult.errors.length > 0) {
            console.log(`     Errors:`);
            localeResult.errors.forEach((error, index) => {
              console.log(`       ${index + 1}. ID ${error.originalId}: ${JSON.stringify(error.error)}`);
            });
          }
        }
      }
      console.log('');
    }

    console.log(`🗺️  ID Mappings created: ${this.idMappings.size}`);
    console.log(`📄 Document ID Mappings created: ${this.documentIdMappings.size}`);
  }

  // Main migration function
  async migrate() {
    console.log('🚀 Starting Lite POI Migration (FIXED VERSION)...\n');
    
    console.log('🎯 Test Configuration:');
    console.log(`   • Max POIs: ${this.maxPOIs}`);
    console.log(`   • Max Tag Labels: ${this.maxTagLabels}`);
    console.log(`   • Locales: ${this.locales.join(', ')}`);
    console.log(`   • Migration order: ${this.migrationOrder.join(' → ')}\n`);
    
    try {
      await this.authenticate();
      this.loadMediaMapping();
      
      // Migrate each content type in dependency order
      for (const contentType of this.migrationOrder) {
        await this.migrateContentType(contentType);
      }
      
      // Calculate summary
      let totalSuccess = 0;
      let totalFailed = 0;
      
      for (const contentType of Object.keys(this.results.locales)) {
        for (const locale of Object.keys(this.results.locales[contentType])) {
          const localeResults = this.results.locales[contentType][locale];
          totalSuccess += localeResults.success;
          totalFailed += localeResults.failed;
        }
      }
      
      this.results.summary = {
        total: totalSuccess + totalFailed,
        success: totalSuccess,
        failed: totalFailed
      };
      
      // Generate detailed summary
      this.generateSummary();
      
      // Save results
      const resultsPath = path.join(__dirname, 'lite-poi-migration-fixed-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      const mappingsPath = path.join(__dirname, 'lite-poi-migration-fixed-mappings.json');
      fs.writeFileSync(mappingsPath, JSON.stringify({
        idMappings: Object.fromEntries(this.idMappings),
        documentIdMappings: Object.fromEntries(this.documentIdMappings)
      }, null, 2));
      
      console.log('🎉 Lite migration completed!');
      console.log(`📊 Summary: ${totalSuccess} succeeded, ${totalFailed} failed out of ${totalSuccess + totalFailed} total operations`);
      console.log(`💾 Results saved to: ${resultsPath}`);
      console.log(`🗺️  Mappings saved to: ${mappingsPath}`);
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new LitePOIMigratorFixed();
  migrator.migrate().catch(console.error);
}

module.exports = LitePOIMigratorFixed;
