#!/usr/bin/env node

/**
 * Lite POI Migrator - Test Version
 * Migrates only 5 POIs with all localizations and relations for testing
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class LitePOIMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.idMappings = new Map(); // Maps old IDs to new IDs per locale
    this.documentIdMappings = new Map(); // Maps old IDs to new documentIds
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
      'api::poi.poi': 'pois'
    };
    
    // Migration order - only what we need for POIs
    this.migrationOrder = [
      'api::tag-label.tag-label',  // POIs depend on tag-labels
      'api::poi.poi'               // Then migrate POIs
    ];
    
    // Test limits
    this.maxPOIs = 5;
    this.maxTagLabels = 10; // Limit tag labels too for faster testing
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

  // Get limited entries for testing
  async getAllDefaultLocaleEntries(contentType) {
    console.log(`📥 Fetching ${contentType} entries with localizations...`);
    
    const endpoint = this.contentTypeEndpoints[contentType];
    if (!endpoint) {
      console.error(`❌ Unknown content type: ${contentType}`);
      return [];
    }
    
    // Determine the limit for this content type
    const limit = contentType === 'api::poi.poi' ? this.maxPOIs : this.maxTagLabels;
    
    try {
      const response = await axios.get(`${this.source.url}/api/${endpoint}`, {
        headers: { Authorization: `Bearer ${this.sourceToken}` },
        params: {
          'pagination[page]': 1,
          'pagination[pageSize]': limit, // Limit entries for testing
          'populate': '*',
          'locale': this.defaultLocale
        }
      });

      const entries = response.data.data || [];
      console.log(`   📄 Found ${entries.length} ${contentType} entries (limited to ${limit} for testing)`);
      
      // Show which entries we're migrating
      if (entries.length > 0) {
        console.log(`   🎯 Testing with entries:`);
        entries.forEach((entry, index) => {
          const name = entry.label || entry.name || `Entry ${entry.id}`;
          const localizationCount = entry.localizations ? entry.localizations.length : 0;
          console.log(`     ${index + 1}. "${name}" (ID: ${entry.id}) - ${localizationCount} localizations`);
        });
      }
      
      return entries;
    } catch (error) {
      console.error(`❌ Error fetching ${contentType}:`, error.response?.data || error.message);
      return [];
    }
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
    
    // Handle slug uniqueness for localizations
    if (cleaned.slug && cleaned.locale && cleaned.locale !== this.defaultLocale) {
      // For non-English locales, create URL-safe slugs
      if (cleaned.locale === 'zh-Hans' || cleaned.locale === 'zh-Hant') {
        // For Chinese, create a simple locale-based slug
        cleaned.slug = `${cleaned.slug}-${cleaned.locale.toLowerCase().replace('-', '')}`;
      } else {
        cleaned.slug = `${cleaned.slug}-${cleaned.locale}`;
      }
    }
    
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

  // Keep only relation fields
  keepOnlyRelationFields(data) {
    const relationFields = ['pickedPOIs', 'tag_labels', 'ownedBy', 'poi', 'recommendedBy'];
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

  // Process relation fields with ID mappings and filter out unmapped relations
  processRelationFields(data, locale, currentContentType) {
    console.log(`     🔍 Processing relations for ${currentContentType} in ${locale} locale...`);
    
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      
      if (Array.isArray(value)) {
        // Process array relations
        const originalCount = value.length;
        data[key] = value.map(item => {
          if (item && typeof item === 'object') {
            if (item.id && (item.url || item.mime)) {
              // Handle media fields
              const mappedId = this.mediaMapping.get(item.id.toString());
              console.log(`       📷 Media ${key}: ${item.id} -> ${mappedId || item.id}`);
              return mappedId ? parseInt(mappedId) : item.id;
            } else if (item.id) {
              // Handle relation fields
              const relatedContentType = this.getContentTypeFromRelation(key);
              if (relatedContentType !== 'unknown') {
                const mappingKey = `${relatedContentType}_${item.id}`;
                const mappedId = this.idMappings.get(mappingKey);
                console.log(`       🔗 Relation ${key}: ${item.id} -> ${mappedId || 'UNMAPPED'}`);
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
              console.log(`       🔗 Direct ID ${key}: ${item} -> ${mappedId || 'UNMAPPED'}`);
              return mappedId || null; // Return null for unmapped relations to filter them out
            }
            return item; // Keep unknown relations as-is
          }
          return item;
        }).filter(item => item !== null); // Remove unmapped relations
        
        const newCount = data[key].length;
        if (originalCount !== newCount) {
          console.log(`       ⚠️  ${key}: Filtered ${originalCount} -> ${newCount} relations (removed unmapped)`);
        }
        
      } else if (value && typeof value === 'object') {
        if (value.id && (value.url || value.mime)) {
          // Handle media fields
          const mappedId = this.mediaMapping.get(value.id.toString());
          console.log(`       📷 Media ${key}: ${value.id} -> ${mappedId || value.id}`);
          data[key] = mappedId ? parseInt(mappedId) : value.id;
        } else if (value.id) {
          // Handle relation fields
          const relatedContentType = this.getContentTypeFromRelation(key);
          if (relatedContentType !== 'unknown') {
            const mappingKey = `${relatedContentType}_${value.id}`;
            const mappedId = this.idMappings.get(mappingKey);
            
            console.log(`       🔗 Single relation ${key}: ${value.id} -> ${mappedId || 'UNMAPPED'}`);
            if (mappedId) {
              data[key] = mappedId;
            } else {
              delete data[key]; // Remove unmapped relations
              console.log(`       ❌ Removed unmapped relation ${key}`);
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
          
          console.log(`       🔗 Direct reference ${key}: ${value} -> ${mappedId || 'UNMAPPED'}`);
          if (mappedId) {
            data[key] = mappedId;
          } else {
            delete data[key]; // Remove unmapped relations
            console.log(`       ❌ Removed unmapped direct reference ${key}`);
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

  // Migrate a content type with all its localizations
  async migrateContentType(contentType) {
    console.log(`\n🚀 Starting lite migration for ${contentType}...`);
    
    // Initialize results for this content type
    if (!this.results.locales[contentType]) {
      this.results.locales[contentType] = {};
      this.locales.forEach(locale => {
        this.results.locales[contentType][locale] = {
          success: 0, failed: 0, errors: [], entries: []
        };
      });
    }
    
    // Phase 1: Get limited entries with their localizations
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
      const name = entry.label || entry.name || `Entry ${entry.id}`;
      console.log(`   Creating entry ${i + 1}/${defaultEntries.length}: "${name}" (ID: ${entry.id})...`);
      
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
        
        console.log(`     ✅ Created with new ID: ${newEntry.id} (documentId: ${newEntry.documentId})`);
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
        console.log(`   Entry ${entry.id} has no localizations, skipping...`);
        continue;
      }
      
      // Get the corresponding destination documentId
      const documentId = this.documentIdMappings.get(`${entry.id}_${this.defaultLocale}`);
      if (!documentId) {
        console.log(`   ⚠️  No documentId found for entry ${entry.id}, skipping localizations`);
        continue;
      }
      
      const name = entry.label || entry.name || `Entry ${entry.id}`;
      console.log(`   Processing localizations for "${name}" (documentId: ${documentId})...`);
      
      // Create each localization
      for (const localization of entry.localizations) {
        const locale = localization.locale;
        if (!this.locales.includes(locale)) {
          console.log(`     ⚠️  Unsupported locale: ${locale}, skipping`);
          continue;
        }
        
        const locName = localization.label || localization.name || `Localization ${localization.id}`;
        console.log(`     Creating ${locale} localization: "${locName}" (ID: ${localization.id})...`);
        
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
      const name = entry.label || entry.name || `Entry ${entry.id}`;
      
      console.log(`   Updating relations for ${this.defaultLocale} entry: "${name}"...`);
      
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
        
        const name = localization.label || localization.name || `Localization ${localization.id}`;
        console.log(`   Updating relations for ${locale} localization: "${name}"...`);
        
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

  // Print detailed migration summary
  printDetailedSummary() {
    console.log('\n📊 DETAILED MIGRATION SUMMARY');
    console.log('===============================');
    
    for (const contentType of Object.keys(this.results.locales)) {
      console.log(`\n🔷 ${contentType}:`);
      
      for (const locale of Object.keys(this.results.locales[contentType])) {
        const localeResults = this.results.locales[contentType][locale];
        console.log(`   ${locale}: ${localeResults.success} success, ${localeResults.failed} failed`);
        
        if (localeResults.entries.length > 0) {
          console.log(`     Entries:`);
          localeResults.entries.forEach((entry, index) => {
            const name = entry.originalEntry.label || entry.originalEntry.name || `Entry ${entry.originalEntry.id}`;
            console.log(`       ${index + 1}. "${name}" (${entry.originalEntry.id} -> ${entry.newEntry.id})`);
          });
        }
        
        if (localeResults.errors.length > 0) {
          console.log(`     Errors:`);
          localeResults.errors.forEach((error, index) => {
            console.log(`       ${index + 1}. ID ${error.originalId}: ${JSON.stringify(error.error)}`);
          });
        }
      }
    }
    
    console.log(`\n🗺️  ID Mappings created: ${this.idMappings.size}`);
    console.log(`📄 Document ID Mappings created: ${this.documentIdMappings.size}`);
  }

  // Main migration function
  async migrate() {
    console.log('🚀 Starting Lite POI Migration (Test Version)...\n');
    console.log(`🎯 Test Configuration:`);
    console.log(`   • Max POIs: ${this.maxPOIs}`);
    console.log(`   • Max Tag Labels: ${this.maxTagLabels}`);
    console.log(`   • Locales: ${this.locales.join(', ')}`);
    console.log(`   • Migration order: ${this.migrationOrder.join(' → ')}\n`);
    
    try {
      await this.authenticate();
      this.loadMediaMapping();
      
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
      const resultsPath = path.join(__dirname, 'lite-poi-migration-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      const mappingsPath = path.join(__dirname, 'lite-poi-migration-mappings.json');
      fs.writeFileSync(mappingsPath, JSON.stringify({
        idMappings: Object.fromEntries(this.idMappings),
        documentIdMappings: Object.fromEntries(this.documentIdMappings)
      }, null, 2));
      
      // Print detailed summary
      this.printDetailedSummary();
      
      console.log('\n🎉 Lite migration completed!');
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
  const migrator = new LitePOIMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = LitePOIMigrator;
