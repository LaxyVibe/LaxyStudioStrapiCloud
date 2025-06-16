#!/usr/bin/env node

/**
 * Internationalized Strapi v5 Migrator - Handles all locales (en, zh-Hans, zh-Hant, ko, ja)
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class I18nStrapiV5Migrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.idMappings = new Map(); // Maps old IDs to new IDs per locale
    this.documentIdMappings = new Map(); // Maps old IDs to new documentIds per locale
    this.results = {
      locales: {},
      summary: { total: 0, success: 0, failed: 0 }
    };
    
    // Supported locales
    this.locales = ['en', 'zh-Hans', 'zh-Hant', 'ko', 'ja'];
    this.defaultLocale = 'en';
    
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

  // Clean entry data for locale migration
  cleanEntryDataForLocale(entry, contentType, locale, isDefaultLocale, phase = 'creation') {
    const cleaned = { ...entry };
    
    // Remove ALL system fields that shouldn't be included in creation
    delete cleaned.id;
    delete cleaned.documentId;
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    delete cleaned.publishedAt;
    delete cleaned.createdBy;
    delete cleaned.updatedBy;
    delete cleaned.localizations; // Remove localizations - we'll handle them separately
    
    // Set the locale for non-default locales
    if (!isDefaultLocale) {
      cleaned.locale = locale;
    }
    
    if (phase === 'creation') {
      // For creation phase, remove relations to avoid dependency issues
      this.removeRelationFields(cleaned, contentType);
    } else {
      // For relation phase, only keep relation fields
      this.keepOnlyRelationFields(cleaned, contentType);
      // Process relations with proper ID mappings
      this.processRelationFields(cleaned, contentType, locale);
    }
    
    // Process media fields
    this.processMediaFields(cleaned);
    
    // Deep clean any nested objects/components that might contain system fields
    this.deepCleanSystemFields(cleaned);
    
    return cleaned;
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

  // Keep only relation fields
  keepOnlyRelationFields(data, contentType) {
    const relationFields = this.getRelationFields(contentType);
    const relationData = {};
    
    relationFields.forEach(field => {
      if (data[field] !== undefined) {
        relationData[field] = data[field];
      }
    });
    
    // Clear original data and copy only relations
    Object.keys(data).forEach(key => delete data[key]);
    Object.assign(data, relationData);
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

  // Process relation fields with ID mappings for specific locale
  processRelationFields(data, contentType, locale) {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (Array.isArray(value)) {
        data[key] = value.map(item => {
          if (item && typeof item === 'object' && item.id) {
            const relatedContentType = this.getContentTypeFromRelation(key);
            // Try to find mapped ID for the same locale first, fallback to default locale
            const mappingKey = `${relatedContentType}_${item.id}_${locale}`;
            const fallbackKey = `${relatedContentType}_${item.id}_${this.defaultLocale}`;
            
            let mappedId = this.idMappings.get(mappingKey) || this.idMappings.get(fallbackKey);
            return mappedId ? mappedId : item.id;
          }
          return item;
        });
      } else if (value && typeof value === 'object' && value.id) {
        const relatedContentType = this.getContentTypeFromRelation(key);
        // Try to find mapped ID for the same locale first, fallback to default locale
        const mappingKey = `${relatedContentType}_${value.id}_${locale}`;
        const fallbackKey = `${relatedContentType}_${value.id}_${this.defaultLocale}`;
        
        let mappedId = this.idMappings.get(mappingKey) || this.idMappings.get(fallbackKey);
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

    // Recursively clean nested objects
    Object.values(data).forEach(value => {
      if (value && typeof value === 'object') {
        this.deepCleanSystemFields(value);
      }
    });
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

  async getEntriesForLocale(contentType, locale) {
    console.log(`📥 Fetching ${contentType} entries for locale ${locale}...`);
    
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
            'populate': '*',
            'locale': locale
          }
        });

        if (response.data.data) {
          console.log(`   📄 Single type entry found for ${locale}`);
          return [response.data.data];
        }
        return [];
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`   ⚪ No ${contentType} content found for locale ${locale}`);
        } else {
          console.error(`❌ Error fetching single type ${contentType} for ${locale}:`, error.response?.data || error.message);
        }
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
            'populate': '*',
            'locale': locale
          }
        });

        const entries = response.data.data;
        const pagination = response.data.meta?.pagination;
        
        if (!entries || entries.length === 0) {
          if (page === 1) {
            console.log(`   ⚪ No entries found for ${locale}`);
          }
          break;
        }
        
        allEntries = allEntries.concat(entries);
        console.log(`   📄 Page ${page}: ${entries.length} entries for ${locale} (Total: ${allEntries.length})`);
        
        if (!pagination || page >= pagination.pageCount || entries.length < pageSize) {
          break;
        }
        
        page++;
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`   ⚪ No ${contentType} content found for locale ${locale}`);
        } else {
          console.error(`❌ Error fetching ${contentType} for ${locale} page ${page}:`, error.response?.data || error.message);
        }
        break;
      }
    }
    
    console.log(`   📊 Total entries found for ${locale}: ${allEntries.length}`);
    return allEntries;
  }

  async createOrUpdateEntry(contentType, entryData, locale, documentId = null, phase = 'creation') {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      if (!endpoint) {
        throw new Error(`Unknown content type: ${contentType}`);
      }
      
      const isDefaultLocale = locale === this.defaultLocale;
      const cleanedData = this.cleanEntryDataForLocale(entryData, contentType, locale, isDefaultLocale, phase);
      
      // Skip if no data to process (for relations phase)
      if (phase === 'relations' && Object.keys(cleanedData).length === 0) {
        return { success: true, skipped: true };
      }
      
      if (this.singleTypes.has(contentType)) {
        // For single types, use PUT with locale parameter for non-default locales
        const url = isDefaultLocale 
          ? `${this.destination.url}/api/${endpoint}`
          : `${this.destination.url}/api/${endpoint}?locale=${locale}`;
          
        const response = await axios.put(url, {
          data: cleanedData
        }, {
          headers: { 
            Authorization: `Bearer ${this.destinationToken}`,
            'Content-Type': 'application/json'
          }
        });
        return { success: true, data: response.data };
      } else {
        // For collection types
        if (documentId && !isDefaultLocale) {
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
      }
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data || error.message,
        status: error.response?.status 
      };
    }
  }

  async migrateContentTypeForLocale(contentType, locale, phase = 'creation') {
    console.log(`\n🚀 Migrating ${contentType} for locale ${locale} (${phase})...`);
    
    const entries = await this.getEntriesForLocale(contentType, locale);
    if (entries.length === 0) {
      console.log(`   ⚪ No entries found for ${contentType} in ${locale}`);
      return { success: 0, failed: 0, errors: [], entries: [] };
    }
    
    const results = { success: 0, failed: 0, errors: [], entries: [] };
    let consecutiveFailures = 0;
    const isDefaultLocale = locale === this.defaultLocale;
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`   📝 Processing entry ${i + 1}/${entries.length} (ID: ${entry.id})...`);
      
      let documentId = null;
      
      // For non-default locales or relations phase, find the corresponding documentId
      if (!isDefaultLocale || phase === 'relations') {
        const mappingKey = `${contentType}_${entry.id}_${this.defaultLocale}`;
        documentId = this.documentIdMappings.get(mappingKey);
        
        if (!documentId && !isDefaultLocale) {
          console.log(`   ⚠️  No default locale entry found for ID ${entry.id}, skipping ${locale} version`);
          continue;
        }
        
        if (!documentId && phase === 'relations') {
          console.log(`   ⚠️  No document found for ID ${entry.id}, skipping relations update`);
          continue;
        }
      }
      
      const result = await this.createOrUpdateEntry(contentType, entry, locale, documentId, phase);
      
      if (result.success) {
        results.success++;
        consecutiveFailures = 0; // Reset consecutive failures
        
        if (result.skipped) {
          console.log(`   ⚪ Skipped (no ${phase} data)`);
        } else {
          const newId = result.data.data.id;
          const newDocumentId = result.data.data.documentId;
          
          console.log(`   ✅ Success - ${locale}: ${entry.id} -> ${newId} (${newDocumentId})`);
          
          // Store mappings only for creation phase
          if (phase === 'creation') {
            const mappingKey = `${contentType}_${entry.id}_${locale}`;
            this.idMappings.set(mappingKey, newId);
            this.documentIdMappings.set(mappingKey, newDocumentId);
          }
          
          results.entries.push({
            originalEntry: entry,
            newId: newId,
            documentId: newDocumentId,
            locale: locale,
            phase: phase
          });
        }
      } else {
        results.failed++;
        consecutiveFailures++;
        
        results.errors.push({
          index: i + 1,
          error: result.error,
          status: result.status,
          originalId: entry.id,
          locale: locale,
          phase: phase
        });
        
        console.log(`   ❌ Failed ${locale} (${phase}): ${result.error?.error?.message || result.error?.message || result.error}`);
        
        // Early termination check
        if (consecutiveFailures >= this.maxConsecutiveFailures) {
          console.log(`   ⚠️  ${this.maxConsecutiveFailures} consecutive failures detected. Terminating ${locale} migration.`);
          break;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`📊 ${contentType} (${locale} - ${phase}): ${results.success} success, ${results.failed} failed`);
    return results;
  }

  async run() {
    console.log('🌍 Internationalized Strapi v5 Content Migration Starting...');
    console.log('============================================================');
    console.log(`🗣️  Supported locales: ${this.locales.join(', ')}`);
    console.log(`🏠 Default locale: ${this.defaultLocale}`);
    console.log('');
    
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

    // Phase 1: Create all entries in default locale (without relations)
    console.log(`\n📋 PHASE 1: Creating entries in default locale (${this.defaultLocale})`);
    console.log('================================================================');
    
    for (const contentType of migrationOrder) {
      console.log(`\n🔄 ========== ${contentType} (${this.defaultLocale}) ==========`);
      
      this.results.locales[contentType] = {};
      
      try {
        const defaultResult = await this.migrateContentTypeForLocale(contentType, this.defaultLocale, 'creation');
        this.results.locales[contentType][this.defaultLocale] = defaultResult;
        this.results.summary.success += defaultResult.success;
        this.results.summary.failed += defaultResult.failed;
        this.results.summary.total += defaultResult.success + defaultResult.failed;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to migrate ${contentType} for ${this.defaultLocale}:`, error.message);
      }
    }

    // Phase 2: Create localizations for other locales (without relations)
    const otherLocales = this.locales.filter(locale => locale !== this.defaultLocale);
    
    if (otherLocales.length > 0) {
      console.log(`\n📋 PHASE 2: Creating localizations (${otherLocales.join(', ')})`);
      console.log('===========================================================');
      
      for (const contentType of migrationOrder) {
        console.log(`\n🔄 ========== ${contentType} (localizations) ==========`);
        
        for (const locale of otherLocales) {
          try {
            const result = await this.migrateContentTypeForLocale(contentType, locale, 'creation');
            this.results.locales[contentType][locale] = result;
            this.results.summary.success += result.success;
            this.results.summary.failed += result.failed;
            this.results.summary.total += result.success + result.failed;
            
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(`❌ Failed to migrate ${contentType} for ${locale}:`, error.message);
          }
        }
      }
    }

    // Phase 3: Update relations for all locales
    console.log(`\n📋 PHASE 3: Updating relations for all locales`);
    console.log('==============================================');
    
    for (const contentType of migrationOrder) {
      console.log(`\n🔄 ========== ${contentType} (relations) ==========`);
      
      for (const locale of this.locales) {
        try {
          const result = await this.migrateContentTypeForLocale(contentType, locale, 'relations');
          
          // Add relation results to existing locale results
          if (this.results.locales[contentType][locale]) {
            this.results.locales[contentType][locale].relationSuccess = result.success;
            this.results.locales[contentType][locale].relationFailed = result.failed;
            this.results.locales[contentType][locale].relationErrors = result.errors;
          }
          
          this.results.summary.success += result.success;
          this.results.summary.failed += result.failed;
          this.results.summary.total += result.success + result.failed;
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Failed to update relations for ${contentType} in ${locale}:`, error.message);
        }
      }
    }

    // Save results
    const resultsPath = path.join(__dirname, 'i18n-migration-results.json');
    const mappingsPath = path.join(__dirname, 'i18n-id-mappings.json');
    
    fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
    
    const mappingsObj = Object.fromEntries(this.idMappings);
    const docMappingsObj = Object.fromEntries(this.documentIdMappings);
    fs.writeFileSync(mappingsPath, JSON.stringify({
      idMappings: mappingsObj,
      documentIdMappings: docMappingsObj
    }, null, 2));

    console.log('\n🎉 INTERNATIONALIZED MIGRATION SUMMARY');
    console.log('======================================');
    console.log(`🌍 Locales migrated: ${this.locales.join(', ')}`);
    console.log(`✅ Total successful operations: ${this.results.summary.success}`);
    console.log(`❌ Total failed operations: ${this.results.summary.failed}`);
    console.log(`📁 Results saved to: ${resultsPath}`);
    console.log(`🔗 ID mappings saved to: ${mappingsPath}`);

    // Detailed summary by content type and locale
    console.log('\n📊 DETAILED BREAKDOWN');
    console.log('=====================');
    for (const [contentType, localeResults] of Object.entries(this.results.locales)) {
      console.log(`\n${contentType}:`);
      for (const [locale, result] of Object.entries(localeResults)) {
        const relationInfo = result.relationSuccess !== undefined 
          ? ` + ${result.relationSuccess} relations` 
          : '';
        console.log(`  ${locale}: ${result.success} entries ✅${relationInfo} / ${result.failed} ❌`);
      }
    }

    const allSuccessful = this.results.summary.failed === 0;
    console.log(allSuccessful ? '\n🌟 All migrations completed successfully!' : '\n⚠️  Some migrations had failures - check the logs above');

    return allSuccessful;
  }
}

// Run if called directly
if (require.main === module) {
  const migrator = new I18nStrapiV5Migrator();
  migrator.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = I18nStrapiV5Migrator;
