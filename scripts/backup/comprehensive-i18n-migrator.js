#!/usr/bin/env node

/**
 * Comprehensive I18n Strapi v5 Migrator
 * Properly handles embedded localizations from source data
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ComprehensiveI18nMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.idMappings = new Map(); // Maps old IDs to new IDs per locale
    this.documentIdMappings = new Map(); // Maps old IDs to new documentIds
    this.localizationMappings = new Map(); // Maps source localizations to destination entries
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
    
    // Migration order (respecting dependencies)
    this.migrationOrder = [
      'api::tag-label.tag-label',
      'api::stay.stay',
      'api::poi.poi',
      'api::suite.suite',
      'api::poi-recommendation.poi-recommendation',
      'api::hub-application-config.hub-application-config'
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

  // Get all entries for default locale (which contains localizations)
  async getAllDefaultLocaleEntries(contentType) {
    console.log(`📥 Fetching ${contentType} entries with localizations...`);
    
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
            'locale': this.defaultLocale
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
    const pageSize = 25;
    
    while (true) {
      try {
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
            console.log(`   ⚪ No entries found`);
          }
          break;
        }
        
        allEntries = allEntries.concat(entries);
        console.log(`   📄 Page ${page}: ${entries.length} entries (Total: ${allEntries.length})`);
        
        if (!pagination || page >= pagination.pageCount || entries.length < pageSize) {
          break;
        }
        
        page++;
        await new Promise(resolve => setTimeout(resolve, 500)); // Increase delay for stability
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
    
    console.log(`   📊 Total entries found: ${allEntries.length}`);
    return allEntries;
  }

  // Extract all localized versions from an entry
  extractAllLocalizations(entry) {
    const localizations = [
      // Default locale entry
      { ...entry, locale: entry.locale || this.defaultLocale }
    ];
    
    // Add all localizations
    if (entry.localizations && Array.isArray(entry.localizations)) {
      entry.localizations.forEach(localization => {
        localizations.push({ ...localization });
      });
    }
    
    return localizations;
  }

  // Clean entry data for migration
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
    delete cleaned.localizations; // Remove localizations - we handle them separately
    
    // Note: In Strapi, different locales can share the same slug
    // No slug modification needed for localizations
    
    if (phase === 'creation') {
      // For creation phase, remove relations to avoid dependency issues
      this.removeRelationFields(cleaned);
    } else {
      // For relation phase, only keep relation fields
      this.keepOnlyRelationFields(cleaned);
    }
    
    // Process media fields
    this.processMediaFields(cleaned);
    
    // Deep clean any nested objects/components that might contain system fields
    this.deepCleanSystemFields(cleaned);
    
    return cleaned;
  }

  // Remove relation fields
  removeRelationFields(data) {
    const relationFields = ['pickedPOIs', 'tag_labels', 'ownedBy', 'poi', 'recommendedBy'];
    relationFields.forEach(field => {
      delete data[field];
    });
    
    // Also remove any nested objects that look like relations
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

  // Process media fields with mapping
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

  // Process relation fields with ID mappings and enhanced logging
  processRelationFields(data, locale, currentContentType) {
    console.log(`     🔍 Processing relations for ${currentContentType} in ${locale} locale...`);
    
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      
      if (Array.isArray(value)) {
        console.log(`       📋 Processing array relation ${key} with ${value.length} items...`);
        const originalCount = value.length;
        
        // Process array relations
        data[key] = value.map(item => {
          if (item && typeof item === 'object') {
            if (item.id && (item.url || item.mime)) {
              // Handle media fields
              const mappedId = this.mediaMapping.get(item.id.toString());
              return mappedId ? parseInt(mappedId) : item.id;
            } else if (item.id) {
              // Handle relation fields
              const relatedContentType = this.getContentTypeFromRelation(key);
              if (relatedContentType !== 'unknown') {
                const mappingKey = `${relatedContentType}_${item.id}`;
                const mappedId = this.idMappings.get(mappingKey);
                console.log(`         🔗 Object ID ${item.id} -> ${mappedId || 'UNMAPPED'}`);
                return mappedId || null; // Return null for unmapped relations to filter them out
              }
              return item; // Keep unknown relations as-is
            }
          } else if (typeof item === 'number') {
            // Handle direct ID references in arrays
            const relatedContentType = this.getContentTypeFromRelation(key);
            if (relatedContentType !== 'unknown') {
              const mappingKey = `${relatedContentType}_${item}`;
              const mappedId = this.idMappings.get(mappingKey);
              console.log(`         🔗 ID ${item} -> ${mappedId || 'UNMAPPED'}`);
              return mappedId || null; // Return null for unmapped relations to filter them out
            }
            return item; // Keep unknown relations as-is
          }
          return item;
        }).filter(item => item !== null); // Remove unmapped relations
        
        const newCount = data[key].length;
        console.log(`       📊 ${key}: ${originalCount} -> ${newCount} relations (removed ${originalCount - newCount} unmapped)`);
        
      } else if (value && typeof value === 'object') {
        if (value.id && (value.url || value.mime)) {
          // Handle media fields
          const mappedId = this.mediaMapping.get(value.id.toString());
          data[key] = mappedId ? parseInt(mappedId) : value.id;
        } else if (value.id) {
          // Handle relation fields
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
          // Keep unknown relations as-is if not in mapping
        } else {
          // Recursively process nested objects
          this.processRelationFields(value, locale, currentContentType);
        }
      } else if (typeof value === 'number') {
        // Handle direct ID references
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
        // Keep unknown relations as-is if not in mapping
      }
    }
  }

  // Deep clean system fields from nested objects
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
          return { success: true, skipped: true };
        }
        
        console.log(`     🔗 Updating relations with data:`, JSON.stringify(cleanedData, null, 2));
      }
      
      // Set locale for non-default locales
      if (!isDefaultLocale && phase === 'creation') {
        cleanedData.locale = locale;
      }
      
      if (this.singleTypes.has(contentType)) {
        // Handle single types
        const url = isDefaultLocale 
          ? `${this.destination.url}/api/${endpoint}`
          : `${this.destination.url}/api/${endpoint}?locale=${locale}`;
          
        const response = await axios.put(url, { data: cleanedData }, {
          headers: { 
            Authorization: `Bearer ${this.destinationToken}`,
            'Content-Type': 'application/json'
          }
        });
        return { success: true, data: response.data };
      } else {
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
      }
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data || error.message,
        status: error.response?.status 
      };
    }
  }

  // Migrate a content type with all its localizations
  async migrateContentType(contentType) {
    console.log(`\n🚀 Starting comprehensive migration for ${contentType}...`);
    
    // Initialize results for this content type
    if (!this.results.locales[contentType]) {
      this.results.locales[contentType] = {};
      this.locales.forEach(locale => {
        this.results.locales[contentType][locale] = {
          success: 0, failed: 0, errors: [], entries: []
        };
      });
    }
    
    // Phase 1: Get all entries with their localizations
    const defaultEntries = await this.getAllDefaultLocaleEntries(contentType);
    if (defaultEntries.length === 0) {
      console.log(`⚪ No entries found for ${contentType}`);
      return;
    }
    
    // Phase 2: Create default locale entries first
    console.log(`\n📝 Phase 1: Creating default locale (${this.defaultLocale}) entries...`);
    const defaultResults = this.results.locales[contentType][this.defaultLocale];
    
    for (let i = 0; i < defaultEntries.length; i++) {
      const entry = defaultEntries[i];
      console.log(`   Creating entry ${i + 1}/${defaultEntries.length} (ID: ${entry.id})...`);
      
      const result = await this.createOrUpdateEntry(contentType, entry, this.defaultLocale, null, 'creation');
      
      if (result.success && !result.skipped) {
        defaultResults.success++;
        const newEntry = result.data.data;
        defaultResults.entries.push({
          originalEntry: entry,
          newEntry: newEntry
        });
        
        // Store ID and documentId mappings using content type prefix
        this.idMappings.set(`${contentType}_${entry.id}`, newEntry.id);
        if (newEntry.documentId) {
          this.documentIdMappings.set(`${contentType}_${entry.id}`, newEntry.documentId);
          this.documentIdMappings.set(`${entry.id}_${this.defaultLocale}`, newEntry.documentId);
        }
        
        console.log(`     ✅ Created with new ID: ${newEntry.id}`);
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
    
    // Phase 3: Create localizations for other locales
    console.log(`\n📝 Phase 2: Creating localizations for other locales...`);
    
    for (const entry of defaultEntries) {
      if (!entry.localizations || entry.localizations.length === 0) {
        continue;
      }
      
      // Get the corresponding destination documentId
      const documentId = this.documentIdMappings.get(`${entry.id}_${this.defaultLocale}`);
      if (!documentId) {
        console.log(`   ⚠️  No documentId found for entry ${entry.id}, skipping localizations`);
        continue;
      }
      
      console.log(`   Processing localizations for entry ${entry.id} (documentId: ${documentId})...`);
      
      // Create each localization
      for (const localization of entry.localizations) {
        const locale = localization.locale;
        if (!this.locales.includes(locale)) {
          console.log(`     ⚠️  Unsupported locale: ${locale}, skipping`);
          continue;
        }
        
        console.log(`     Creating ${locale} localization (ID: ${localization.id})...`);
        
        const result = await this.createOrUpdateEntry(contentType, localization, locale, documentId, 'creation');
        const localeResults = this.results.locales[contentType][locale];
        
        if (result.success && !result.skipped) {
          localeResults.success++;
          const newEntry = result.data.data;
          localeResults.entries.push({
            originalEntry: localization,
            newEntry: newEntry
          });
          
          // Store ID mapping for this locale using content type prefix
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
    
    // Phase 4: Update relations for all locales
    console.log(`\n📝 Phase 3: Updating relations for all locales...`);
    
    // Update relations for default locale
    for (const entryResult of defaultResults.entries) {
      const entry = entryResult.originalEntry;
      const newEntry = entryResult.newEntry;
      
      const result = await this.createOrUpdateEntry(contentType, entry, this.defaultLocale, newEntry.documentId, 'relations');
      if (result.success && !result.skipped) {
        console.log(`     ✅ Updated relations for ${this.defaultLocale} entry ${newEntry.id}`);
      } else if (!result.skipped) {
        console.log(`     ⚠️  Failed to update relations for ${this.defaultLocale} entry ${newEntry.id}:`, result.error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Update relations for other locales
    for (const entry of defaultEntries) {
      if (!entry.localizations || entry.localizations.length === 0) {
        continue;
      }
      
      const documentId = this.documentIdMappings.get(`${entry.id}_${this.defaultLocale}`);
      if (!documentId) continue;
      
      for (const localization of entry.localizations) {
        const locale = localization.locale;
        if (!this.locales.includes(locale)) continue;
        
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

  // Main migration function
  async migrate() {
    console.log('🚀 Starting Comprehensive I18n Migration...\n');
    
    try {
      await this.authenticate();
      this.loadMediaMapping();
      
      console.log(`📋 Migration order: ${this.migrationOrder.join(' → ')}`);
      console.log(`🌍 Target locales: ${this.locales.join(', ')}\n`);
      
      // Migrate each content type in order
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
      
      // Save results
      const resultsPath = path.join(__dirname, 'comprehensive-i18n-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      const mappingsPath = path.join(__dirname, 'comprehensive-i18n-mappings.json');
      fs.writeFileSync(mappingsPath, JSON.stringify({
        idMappings: Object.fromEntries(this.idMappings),
        documentIdMappings: Object.fromEntries(this.documentIdMappings)
      }, null, 2));
      
      console.log('\n🎉 Migration completed!');
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
  const migrator = new ComprehensiveI18nMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = ComprehensiveI18nMigrator;
