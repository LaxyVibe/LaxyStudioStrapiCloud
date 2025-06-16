#!/usr/bin/env node

/**
 * STEP 2: Non-English Localizations Migrator
 * Creates localizations for all non-English locales based on Step 1 results
 * Focus: Localization creation with media mapping (no relations)
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class Step2NonEnLocalizationsMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.step1Results = null;
    this.step1Mappings = null;
    this.results = {
      locales: {},
      summary: { total: 0, success: 0, failed: 0 }
    };
    
    // Supported locales (excluding English)
    this.locales = ['zh-Hans', 'zh-Hant', 'ko', 'ja'];
    this.defaultLocale = 'en';
    
    // Content type to endpoint mapping
    this.contentTypeEndpoints = {
      'api::tag-label.tag-label': 'tag-labels',
      'api::stay.stay': 'stays',
      'api::poi.poi': 'pois',
      'api::suite.suite': 'suites',
      'api::poi-recommendation.poi-recommendation': 'poi-recommendations'
    };
    
    // Migration order - same as step 1
    this.migrationOrder = [
      'api::tag-label.tag-label',
      'api::stay.stay',
      'api::poi.poi',
      'api::suite.suite',
      'api::poi-recommendation.poi-recommendation'
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

  loadStep1Results() {
    try {
      const resultsPath = path.join(__dirname, 'step1-en-content-results.json');
      const mappingsPath = path.join(__dirname, 'step1-en-content-mappings.json');
      
      if (!fs.existsSync(resultsPath) || !fs.existsSync(mappingsPath)) {
        throw new Error('Step 1 results not found. Please run step1-en-content-migrator.js first.');
      }
      
      this.step1Results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      this.step1Mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
      
      console.log(`📄 Loaded Step 1 results: ${this.step1Results.summary.success} successful English entries`);
      console.log(`🗺️  Loaded Step 1 mappings: ${Object.keys(this.step1Mappings.idMappings).length} ID mappings`);
    } catch (error) {
      throw new Error(`Failed to load Step 1 results: ${error.message}`);
    }
  }

  loadMediaMapping() {
    try {
      const mappingPath = path.join(__dirname, 'mediaMappings.json');
      if (fs.existsSync(mappingPath)) {
        const data = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        this.mediaMapping = new Map(Object.entries(data));
        console.log(`📁 Loaded ${this.mediaMapping.size} media mappings`);
      } else {
        console.warn('⚠️  No media mappings found. Please run media-migrator.js first.');
      }
    } catch (error) {
      console.warn('⚠️  Could not load media mapping:', error.message);
    }
  }

  // Enhanced media field processing with inheritance from English parent
  processMediaFields(localizationData, englishParentData = null) {
    // First process media fields in the localization data itself
    this.processMediaFieldsInObject(localizationData);
    
    // If we have English parent data, inherit missing media fields
    if (englishParentData) {
      this.inheritMediaFieldsFromParent(localizationData, englishParentData);
    }
  }

  // Process media fields in an object
  processMediaFieldsInObject(data) {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      
      if (Array.isArray(value)) {
        data[key] = value.map(item => {
          if (item && typeof item === 'object' && item.id && this.isMediaObject(item)) {
            const mappedId = this.mediaMapping.get(item.id.toString());
            if (mappedId) {
              console.log(`     📸 Media array item ${item.id} → ${mappedId} for field '${key}'`);
              return parseInt(mappedId);
            } else {
              console.log(`     ⚠️  Unmapped media array item ${item.id} in field '${key}'`);
              return item.id;
            }
          }
          return item;
        });
      } else if (value && typeof value === 'object' && value.id && this.isMediaObject(value)) {
        const mappedId = this.mediaMapping.get(value.id.toString());
        if (mappedId) {
          console.log(`     📸 Media field '${key}': ${value.id} → ${mappedId}`);
          data[key] = parseInt(mappedId);
        } else {
          console.log(`     ⚠️  Unmapped media field '${key}': ${value.id}`);
          data[key] = value.id;
        }
      } else if (value && typeof value === 'object') {
        // Recursively process nested objects
        this.processMediaFieldsInObject(value);
      }
    }
  }

  // Inherit media fields from English parent when missing in localization
  inheritMediaFieldsFromParent(localizationData, englishParentData) {
    console.log(`     🔄 Checking for media fields to inherit from English parent...`);
    
    for (const [key, parentValue] of Object.entries(englishParentData)) {
      // Skip non-media fields and system fields
      if (key === 'id' || key === 'documentId' || key === 'locale' || key === 'createdAt' || key === 'updatedAt' || key === 'publishedAt') {
        continue;
      }
      
      // Check if this field is missing or null in localization
      const localizationValue = localizationData[key];
      const isLocalizationFieldEmpty = localizationValue === null || localizationValue === undefined || 
        (Array.isArray(localizationValue) && localizationValue.length === 0);
      
      // Check if parent field contains media
      const parentHasMedia = this.containsMedia(parentValue);
      
      if (isLocalizationFieldEmpty && parentHasMedia) {
        console.log(`     📂 Inheriting media field '${key}' from English parent`);
        localizationData[key] = parentValue; // This will be processed by processMediaFieldsInObject
      }
    }
  }

  // Check if a value contains media objects
  containsMedia(value) {
    if (!value) return false;
    
    if (Array.isArray(value)) {
      return value.some(item => this.isMediaObject(item));
    } else if (typeof value === 'object') {
      return this.isMediaObject(value);
    }
    
    return false;
  }

  // Enhanced media object detection
  isMediaObject(obj) {
    if (!obj || typeof obj !== 'object' || !obj.id) return false;
    return !!(obj.url || obj.mime || obj.formats || obj.provider || obj.size || obj.ext || obj.alternativeText);
  }

  // Clean entry data for localization creation (no relations)
  cleanEntryData(entry, englishParentData = null) {
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
    delete cleaned.originalLocaleRef; // Our custom field
    
    // Remove all relation fields for step 2
    this.removeRelationFields(cleaned);
    
    // Enhanced media field processing with inheritance
    console.log(`     🖼️  Processing media fields...`);
    this.processMediaFields(cleaned, englishParentData);
    
    // Deep clean system fields
    this.deepCleanSystemFields(cleaned);
    
    return cleaned;
  }

  // Remove relation fields but preserve media
  removeRelationFields(data) {
    // Comprehensive list of relation fields
    const relationFields = [
      'pickedPOIs', 'tag_labels', 'ownedBy', 'poi', 'recommendedBy', 'recommended_by',
      'stay', 'suites', 'recommendations', 'POIs', 'stays'
    ];
    
    relationFields.forEach(field => {
      if (data[field] !== undefined) {
        console.log(`       🗑️  Removing relation field '${field}'`);
        delete data[field];
      }
    });
    
    // Remove nested objects that look like relations (but not media)
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.id !== undefined && !this.isMediaObject(value)) {
          console.log(`       🗑️  Removing single relation '${key}' with ID ${value.id}`);
          delete data[key];
        }
      } else if (Array.isArray(value)) {
        const hasRelations = value.some(item => 
          item && typeof item === 'object' && item.id !== undefined && !this.isMediaObject(item)
        );
        if (hasRelations) {
          console.log(`       🗑️  Removing array relation '${key}' with ${value.length} items`);
          delete data[key];
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

  // Create localization
  async createLocalization(contentType, localizationData, locale, documentId, englishParentData = null) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      const cleanedData = this.cleanEntryData(localizationData, englishParentData);
      
      // Set locale
      cleanedData.locale = locale;
      
      const response = await axios.put(`${this.destination.url}/api/${endpoint}/${documentId}?locale=${locale}`, {
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

  // Migrate content type localizations
  async migrateContentTypeLocalizations(contentType) {
    console.log(`\n🚀 Starting Step 2 migration for ${contentType} localizations...`);
    
    // Initialize results
    if (!this.results.locales[contentType]) {
      this.results.locales[contentType] = {};
      this.locales.forEach(locale => {
        this.results.locales[contentType][locale] = {
          success: 0, failed: 0, errors: [], entries: []
        };
      });
    }
    
    // Get step 1 results for this content type
    const step1TypeResults = this.step1Results.contentTypes[contentType];
    if (!step1TypeResults || step1TypeResults.sourceEntries.length === 0) {
      console.log(`⚪ No Step 1 entries found for ${contentType}`);
      return;
    }
    
    console.log(`📊 Processing ${step1TypeResults.sourceEntries.length} entries from Step 1...`);
    
    // Process each source entry's localizations
    for (const sourceEntry of step1TypeResults.sourceEntries) {
      if (!sourceEntry.localizations || sourceEntry.localizations.length === 0) {
        console.log(`   ⚪ No localizations for "${sourceEntry.name}" (ID: ${sourceEntry.id})`);
        continue;
      }
      
      // Get the document ID from step 1 mapping
      const documentId = this.step1Mappings.documentIdMappings[`${contentType}_${sourceEntry.id}`];
      if (!documentId) {
        console.log(`   ⚠️  No documentId found for entry ${sourceEntry.id}, skipping localizations`);
        continue;
      }
      
      // Get the English parent data for media field inheritance
      // We need to fetch the actual English entry from destination to get media fields
      let englishParentEntry = null;
      try {
        const endpoint = this.contentTypeEndpoints[contentType];
        const response = await axios.get(`${this.destination.url}/api/${endpoint}/${documentId}`, {
          headers: { Authorization: `Bearer ${this.destinationToken}` },
          params: {
            'locale': 'en',
            'populate': '*'
          }
        });
        englishParentEntry = response.data.data;
        console.log(`   📥 Fetched English parent entry for media inheritance`);
      } catch (error) {
        console.warn(`   ⚠️  Could not fetch English parent entry: ${error.message}`);
      }
      
      console.log(`   📝 Processing localizations for "${sourceEntry.name}" (documentId: ${documentId})...`);
      
      // Process each localization
      for (const localizationInfo of sourceEntry.localizations) {
        const locale = localizationInfo.locale;
        
        if (!this.locales.includes(locale)) {
          console.log(`     ⚠️  Unsupported locale: ${locale}, skipping`);
          continue;
        }
        
        console.log(`     🌐 Creating ${locale} localization (ID: ${localizationInfo.id})...`);
        
        // Use localization data from Step 1 results (already fully populated)
        const localizationData = localizationInfo;
        if (!localizationData) {
          const localeResults = this.results.locales[contentType][locale];
          localeResults.failed++;
          localeResults.errors.push({
            originalId: localizationInfo.id,
            error: 'No localization data available'
          });
          continue;
        }
        
        const localizedName = localizationData.name || localizationData.label || localizationData.title || `Localized ${localizationInfo.id}`;
        
        // Pass English parent data for media field inheritance
        const result = await this.createLocalization(contentType, localizationData, locale, documentId, englishParentEntry);
        const localeResults = this.results.locales[contentType][locale];
        
        if (result.success) {
          localeResults.success++;
          const newEntry = result.data.data;
          localeResults.entries.push({
            originalId: localizationInfo.id,
            originalName: localizedName,
            newId: newEntry.id,
            documentId: documentId,
            locale: locale
          });
          
          console.log(`       ✅ Created ${locale} localization with ID: ${newEntry.id}`);
        } else {
          localeResults.failed++;
          localeResults.errors.push({
            originalId: localizationInfo.id,
            originalName: localizedName,
            error: result.error
          });
          console.log(`       ❌ Failed:`, JSON.stringify(result.error));
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }

  // Generate summary
  generateSummary() {
    console.log(`\n📊 STEP 2: NON-ENGLISH LOCALIZATIONS MIGRATION SUMMARY`);
    console.log(`====================================================\n`);

    for (const contentType of this.migrationOrder) {
      const typeResults = this.results.locales[contentType];
      if (!typeResults) continue;

      console.log(`🔷 ${contentType}:`);

      for (const locale of this.locales) {
        const localeResult = typeResults[locale];
        if (localeResult.success > 0 || localeResult.failed > 0) {
          console.log(`   ${locale}: ${localeResult.success} success, ${localeResult.failed} failed`);
          
          if (localeResult.entries.length > 0) {
            console.log(`     Entries:`);
            localeResult.entries.forEach((entryResult, index) => {
              console.log(`       ${index + 1}. "${entryResult.originalName}" (${entryResult.originalId} → ${entryResult.newId})`);
            });
          }
          
          if (localeResult.errors.length > 0) {
            console.log(`     Errors:`);
            localeResult.errors.forEach((error, index) => {
              console.log(`       ${index + 1}. "${error.originalName}" (ID: ${error.originalId}): ${JSON.stringify(error.error)}`);
            });
          }
        }
      }
      console.log('');
    }
  }

  // Main migration function
  async migrate() {
    console.log('🚀 Starting STEP 2: Non-English Localizations Migration...\n');
    
    console.log('🎯 Step 2 Configuration:');
    console.log(`   • Locales: ${this.locales.join(', ')}`);
    console.log(`   • Based on: Step 1 English content results`);
    console.log(`   • Focus: Localization creation with media, NO relations`);
    console.log(`   • Migration order: ${this.migrationOrder.join(' → ')}\n`);
    
    try {
      await this.authenticate();
      this.loadStep1Results();
      this.loadMediaMapping();
      
      // Migrate each content type in dependency order
      for (const contentType of this.migrationOrder) {
        await this.migrateContentTypeLocalizations(contentType);
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
      
      // Save results for step 3
      const resultsPath = path.join(__dirname, 'step2-non-en-localizations-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      console.log('🎉 Step 2: Non-English Localizations migration completed!');
      console.log(`📊 Summary: ${totalSuccess} succeeded, ${totalFailed} failed out of ${totalSuccess + totalFailed} total operations`);
      console.log(`💾 Results saved to: ${resultsPath}`);
      console.log(`\n🔜 Next: Run step3-relations-migrator.js`);
      
    } catch (error) {
      console.error('❌ Step 2 migration failed:', error);
      throw error;
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new Step2NonEnLocalizationsMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = Step2NonEnLocalizationsMigrator;
