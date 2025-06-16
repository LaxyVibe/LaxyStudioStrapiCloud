#!/usr/bin/env node

/**
 * STEP 1: English Content Migrator
 * Creates all content types in English locale only (no relations, no localizations)
 * Focus: Basic content structure and media mapping
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class Step1EnglishContentMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.idMappings = new Map();
    this.documentIdMappings = new Map();
    this.results = {
      contentTypes: {},
      summary: { total: 0, success: 0, failed: 0 }
    };
    
    // Only English locale for step 1
    this.defaultLocale = 'en';
    
    // Test limits - small numbers for focused testing
    this.maxStays = 300;
    this.maxPOIs = 500;
    this.maxTagLabels = 1000;
    this.maxPOIRecommendations = 300;
    this.maxSuites = 200;
    
    // Content type to endpoint mapping
    this.contentTypeEndpoints = {
      'api::tag-label.tag-label': 'tag-labels',
      'api::stay.stay': 'stays',
      'api::poi.poi': 'pois',
      'api::suite.suite': 'suites',
      'api::poi-recommendation.poi-recommendation': 'poi-recommendations'
    };
    
    // Migration order - dependencies first
    this.migrationOrder = [
      'api::tag-label.tag-label',    // First - no dependencies
      'api::stay.stay',              // Second - may reference tag-labels
      'api::poi.poi',                // Third - may reference stays and tag-labels
      'api::suite.suite',            // Fourth - may reference stays
      'api::poi-recommendation.poi-recommendation' // Last - references POIs and stays
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
      } else {
        console.warn('⚠️  No media mappings found. Please run media-migrator.js first.');
      }
    } catch (error) {
      console.warn('⚠️  Could not load media mapping:', error.message);
    }
  }

  // Get all entries for default locale (English only)
  async getAllDefaultLocaleEntries(contentType) {
    console.log(`📥 Fetching ${contentType} entries (English only)...`);
    
    const endpoint = this.contentTypeEndpoints[contentType];
    if (!endpoint) {
      console.error(`❌ Unknown content type: ${contentType}`);
      return [];
    }
    
    let allEntries = [];
    let page = 1;
    const pageSize = 25;
    
    // Set limits based on content type
    let maxEntries;
    switch (contentType) {
      case 'api::stay.stay':
        maxEntries = this.maxStays;
        break;
      case 'api::poi.poi':
        maxEntries = this.maxPOIs;
        break;
      case 'api::tag-label.tag-label':
        maxEntries = this.maxTagLabels;
        break;
      case 'api::poi-recommendation.poi-recommendation':
        maxEntries = this.maxPOIRecommendations;
        break;
      case 'api::suite.suite':
        maxEntries = this.maxSuites;
        break;
      default:
        maxEntries = 5;
    }
    
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
          timeout: 600000
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
        
        // Enhanced: Fetch full localization data with media fields
        for (const entry of entriesToAdd) {
          if (entry.localizations && entry.localizations.length > 0) {
            console.log(`   🌐 Fetching full localization data for "${entry.name || entry.id}"...`);
            entry.localizations = await this.fetchFullLocalizationData(endpoint, entry.documentId, entry.localizations);
          }
        }
        
        allEntries = allEntries.concat(entriesToAdd);
        
        console.log(`   📄 Page ${page}: ${entriesToAdd.length} entries (Total: ${allEntries.length})`);
        
        if (allEntries.length >= maxEntries || !pagination || page >= pagination.pageCount || entries.length < pageSize) {
          break;
        }
        
        page++;
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ Error fetching ${contentType} page ${page}:`, error.response?.data || error.message);
        if (error.code === 'ECONNABORTED') {
          console.log(`   ⏱️  Request timed out, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        break;
      }
    }
    
    console.log(`   📊 Found ${allEntries.length} ${contentType} entries (limited to ${maxEntries} for testing)`);
    
    // Log entries with localization count for step 2 planning
    if (allEntries.length > 0) {
      console.log(`   🎯 Entries to be processed:`);
      allEntries.forEach((entry, index) => {
        const localizationCount = entry.localizations ? entry.localizations.length : 0;
        const entryName = entry.name || entry.label || entry.title || `Entry ${entry.id}`;
        console.log(`     ${index + 1}. "${entryName}" (ID: ${entry.id}) - ${localizationCount} localizations`);
      });
    }
    
    return allEntries;
  }

  // NEW: Fetch full localization data with media fields populated
  async fetchFullLocalizationData(endpoint, documentId, localizationRefs) {
    const fullLocalizations = [];
    
    for (const locRef of localizationRefs) {
      try {
        console.log(`     📥 Fetching ${locRef.locale} localization (ID: ${locRef.id})...`);
        
        // Fetch the full localization with all media fields populated
        const response = await axios.get(`${this.source.url}/api/${endpoint}/${documentId}`, {
          headers: { Authorization: `Bearer ${this.sourceToken}` },
          params: {
            'locale': locRef.locale,
            'populate': '*' // This will populate all fields including media
          },
          timeout: 30000
        });

        const fullLocalization = response.data.data;
        if (fullLocalization) {
          console.log(`       ✅ Fetched ${locRef.locale} with ${JSON.stringify(fullLocalization).length} bytes`);
          fullLocalizations.push({
            ...fullLocalization,
            originalLocaleRef: locRef // Keep original reference
          });
        } else {
          console.warn(`       ⚠️  No data returned for ${locRef.locale}`);
          fullLocalizations.push(locRef); // Fallback to basic info
        }
        
        await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
      } catch (error) {
        console.error(`       ❌ Failed to fetch ${locRef.locale}:`, error.response?.data || error.message);
        fullLocalizations.push(locRef); // Fallback to basic info
      }
    }
    
    return fullLocalizations;
  }

  // Enhanced media field processing
  processMediaFields(data) {
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
      }
    }
  }

  // Enhanced media object detection
  isMediaObject(obj) {
    if (!obj || typeof obj !== 'object' || !obj.id) return false;
    return !!(obj.url || obj.mime || obj.formats || obj.provider || obj.size || obj.ext || obj.alternativeText);
  }

  // Clean entry data for English content creation (no relations)
  cleanEntryData(entry) {
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
    
    // Remove all relation fields for step 1
    this.removeRelationFields(cleaned);
    
    // Process media fields
    console.log(`   🖼️  Processing media fields...`);
    this.processMediaFields(cleaned);
    
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
        console.log(`     🗑️  Removing relation field '${field}'`);
        delete data[field];
      }
    });
    
    // Remove nested objects that look like relations (but not media)
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.id !== undefined && !this.isMediaObject(value)) {
          console.log(`     🗑️  Removing single relation '${key}' with ID ${value.id}`);
          delete data[key];
        }
      } else if (Array.isArray(value)) {
        const hasRelations = value.some(item => 
          item && typeof item === 'object' && item.id !== undefined && !this.isMediaObject(item)
        );
        if (hasRelations) {
          console.log(`     🗑️  Removing array relation '${key}' with ${value.length} items`);
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

  // Create English entry
  async createEnglishEntry(contentType, entryData) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      const cleanedData = this.cleanEntryData(entryData);
      
      const response = await axios.post(`${this.destination.url}/api/${endpoint}`, {
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

  // Migrate content type (English only)
  async migrateContentType(contentType) {
    console.log(`\n🚀 Starting Step 1 migration for ${contentType} (English only)...`);
    
    // Initialize results
    this.results.contentTypes[contentType] = {
      success: 0, 
      failed: 0, 
      errors: [], 
      entries: [],
      sourceEntries: []
    };
    
    // Get entries
    const entries = await this.getAllDefaultLocaleEntries(contentType);
    if (entries.length === 0) {
      console.log(`⚪ No entries found for ${contentType}`);
      return;
    }

    // Store source entries for step 2 reference
    this.results.contentTypes[contentType].sourceEntries = entries.map(entry => ({
      id: entry.id,
      documentId: entry.documentId, // Add documentId for Step 3 API calls
      name: entry.name || entry.label || entry.title || `Entry ${entry.id}`,
      localizations: entry.localizations || []
    }));
    
    const typeResults = this.results.contentTypes[contentType];
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const entryName = entry.name || entry.label || entry.title || `Entry ${entry.id}`;
      console.log(`   Creating English entry ${i + 1}/${entries.length}: "${entryName}" (ID: ${entry.id})...`);
      
      const result = await this.createEnglishEntry(contentType, entry);
      
      if (result.success) {
        typeResults.success++;
        const newEntry = result.data.data;
        typeResults.entries.push({
          originalId: entry.id,
          originalName: entryName,
          newId: newEntry.id,
          documentId: newEntry.documentId,
          newEntry: newEntry
        });
        
        // Store mappings for steps 2 and 3
        this.idMappings.set(`${contentType}_${entry.id}`, newEntry.id);
        if (newEntry.documentId) {
          this.documentIdMappings.set(`${contentType}_${entry.id}`, newEntry.documentId);
        }
        
        console.log(`     ✅ Created with new ID: ${newEntry.id}${newEntry.documentId ? ` (documentId: ${newEntry.documentId})` : ''}`);
      } else {
        typeResults.failed++;
        typeResults.errors.push({
          originalId: entry.id,
          originalName: entryName,
          error: result.error
        });
        console.log(`     ❌ Failed:`, JSON.stringify(result.error));
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Generate summary
  generateSummary() {
    console.log(`\n📊 STEP 1: ENGLISH CONTENT MIGRATION SUMMARY`);
    console.log(`===========================================\n`);

    for (const contentType of this.migrationOrder) {
      const typeResults = this.results.contentTypes[contentType];
      if (!typeResults) continue;

      console.log(`🔷 ${contentType}:`);
      console.log(`   ✅ Success: ${typeResults.success}`);
      console.log(`   ❌ Failed: ${typeResults.failed}`);
      
      if (typeResults.entries.length > 0) {
        console.log(`   📋 Created entries:`);
        typeResults.entries.forEach((entryResult, index) => {
          console.log(`     ${index + 1}. "${entryResult.originalName}" (${entryResult.originalId} → ${entryResult.newId})`);
        });
      }
      
      if (typeResults.errors.length > 0) {
        console.log(`   🚨 Errors:`);
        typeResults.errors.forEach((error, index) => {
          console.log(`     ${index + 1}. "${error.originalName}" (ID: ${error.originalId}): ${JSON.stringify(error.error)}`);
        });
      }

      // Show localization planning for step 2
      if (typeResults.sourceEntries.length > 0) {
        const totalLocalizations = typeResults.sourceEntries.reduce((sum, entry) => sum + entry.localizations.length, 0);
        console.log(`   🌐 Localizations for Step 2: ${totalLocalizations} total`);
      }
      
      console.log('');
    }

    console.log(`🗺️  ID Mappings created: ${this.idMappings.size}`);
    console.log(`📄 Document ID Mappings created: ${this.documentIdMappings.size}`);
  }

  // Main migration function
  async migrate() {
    console.log('🚀 Starting STEP 1: English Content Migration...\n');
    
    console.log('🎯 Step 1 Configuration:');
    console.log(`   • Locale: English (${this.defaultLocale}) only`);
    console.log(`   • Max Stays: ${this.maxStays}`);
    console.log(`   • Max POIs: ${this.maxPOIs}`);
    console.log(`   • Max Tag Labels: ${this.maxTagLabels}`);
    console.log(`   • Max POI Recommendations: ${this.maxPOIRecommendations}`);
    console.log(`   • Max Suites: ${this.maxSuites}`);
    console.log(`   • Focus: Content creation with media, NO relations, NO localizations`);
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
      
      for (const contentType of Object.keys(this.results.contentTypes)) {
        const typeResults = this.results.contentTypes[contentType];
        totalSuccess += typeResults.success;
        totalFailed += typeResults.failed;
      }
      
      this.results.summary = {
        total: totalSuccess + totalFailed,
        success: totalSuccess,
        failed: totalFailed
      };
      
      // Generate detailed summary
      this.generateSummary();
      
      // Save results for steps 2 and 3
      const resultsPath = path.join(__dirname, 'step1-en-content-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      const mappingsPath = path.join(__dirname, 'step1-en-content-mappings.json');
      fs.writeFileSync(mappingsPath, JSON.stringify({
        idMappings: Object.fromEntries(this.idMappings),
        documentIdMappings: Object.fromEntries(this.documentIdMappings)
      }, null, 2));
      
      console.log('🎉 Step 1: English Content migration completed!');
      console.log(`📊 Summary: ${totalSuccess} succeeded, ${totalFailed} failed out of ${totalSuccess + totalFailed} total operations`);
      console.log(`💾 Results saved to: ${resultsPath}`);
      console.log(`🗺️  Mappings saved to: ${mappingsPath}`);
      console.log(`\n🔜 Next: Run step2-non-en-localizations-migrator.js`);
      
    } catch (error) {
      console.error('❌ Step 1 migration failed:', error);
      throw error;
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new Step1EnglishContentMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = Step1EnglishContentMigrator;
