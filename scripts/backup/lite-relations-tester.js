#!/usr/bin/env node

/**
 * Lite Relations Tester Migrator - FOCUSED VERSION
 * Tests migration of 3 stays, 5 POIs, and 3 poi-recommendations with all relations
 * Focus: Fix relation processing for poi, recommended_by, pickedPOIs, etc.
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class LiteRelationsTesterMigrator {
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
      summary: { total: 0, success: 0, failed: 0 },
      relationStats: { total: 0, mapped: 0, unmapped: 0 }
    };
    
    // Supported locales
    this.locales = ['en', 'zh-Hans', 'zh-Hant', 'ko', 'ja'];
    this.defaultLocale = 'en';
    
    // Test limits - small numbers for focused testing
    this.maxStays = 3;
    this.maxPOIs = 5;
    this.maxTagLabels = 10;
    this.maxPOIRecommendations = 3;
    this.maxSuites = 2;
    
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

  // Get all entries for default locale with limits
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
          timeout: 60000
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
    
    // Log entries with relation analysis
    if (allEntries.length > 0) {
      console.log(`   🎯 Testing entries with relation analysis:`);
      allEntries.forEach((entry, index) => {
        const localizationCount = entry.localizations ? entry.localizations.length : 0;
        const entryName = entry.name || entry.label || entry.title || `Entry ${entry.id}`;
        const relationInfo = this.analyzeRelations(entry);
        console.log(`     ${index + 1}. "${entryName}" (ID: ${entry.id}) - ${localizationCount} localizations`);
        console.log(`        🔗 Relations: ${relationInfo}`);
      });
    }
    
    return allEntries;
  }

  // Analyze relations in an entry for debugging
  analyzeRelations(entry) {
    const relations = [];
    
    // Check for all possible relation fields
    const relationFields = [
      'tag_labels', 'pickedPOIs', 'ownedBy', 'poi', 'recommendedBy', 'recommended_by',
      'stay', 'suites', 'recommendations', 'POIs', 'stays'
    ];
    
    relationFields.forEach(field => {
      if (entry[field] !== undefined && entry[field] !== null) {
        if (Array.isArray(entry[field])) {
          relations.push(`${field}[${entry[field].length}]`);
        } else {
          relations.push(field);
        }
      }
    });
    
    return relations.length > 0 ? relations.join(', ') : 'None';
  }

  // Enhanced media field processing
  processMediaFields(data, phase = 'creation') {
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

  // Clean entry data for migration
  cleanEntryData(entry, phase = 'creation', locale = null) {
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
    
    // Note: Strapi allows shared slugs across locales - no modification needed
    
    if (phase === 'creation') {
      // For creation phase, remove relations but keep media
      this.removeRelationFields(cleaned);
      console.log(`   🖼️  Processing media fields for creation phase...`);
      this.processMediaFields(cleaned, 'creation');
    } else {
      // For relation phase, only keep relation fields
      this.keepOnlyRelationFields(cleaned);
    }
    
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
      delete data[field];
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

  // Keep only relation fields with ID conversion
  keepOnlyRelationFields(data) {
    // Comprehensive list of relation fields
    const relationFields = [
      'pickedPOIs', 'tag_labels', 'ownedBy', 'poi', 'recommendedBy', 'recommended_by',
      'stay', 'suites', 'recommendations', 'POIs', 'stays'
    ];
    
    const relationData = {};
    
    relationFields.forEach(field => {
      if (data[field] !== undefined) {
        console.log(`     🔄 Processing relation field '${field}'...`);
        
        // Convert relation objects to IDs if needed
        if (Array.isArray(data[field])) {
          relationData[field] = data[field].map(item => {
            if (item && typeof item === 'object' && item.id) {
              console.log(`       📝 Array item: object ID ${item.id} → ${item.id}`);
              return item.id; // Extract ID from object
            }
            console.log(`       📝 Array item: direct value ${item}`);
            return item; // Keep as-is if already an ID
          });
        } else if (data[field] && typeof data[field] === 'object' && data[field].id) {
          console.log(`       📝 Single object: ID ${data[field].id} → ${data[field].id}`);
          relationData[field] = data[field].id; // Extract ID from object
        } else {
          console.log(`       📝 Direct value: ${data[field]}`);
          relationData[field] = data[field]; // Keep as-is
        }
      }
    });
    
    // Clear original data and copy only relations
    Object.keys(data).forEach(key => delete data[key]);
    Object.assign(data, relationData);
    
    console.log(`     📊 Relation fields prepared: ${Object.keys(relationData).join(', ')}`);
  }

  // ENHANCED: Get content type from relation field name with comprehensive mapping
  getContentTypeFromRelation(fieldName) {
    const relationMappings = {
      // Tag relations
      'tag_labels': 'api::tag-label.tag-label',
      
      // Stay relations
      'ownedBy': 'api::stay.stay',
      'recommendedBy': 'api::stay.stay',
      'recommended_by': 'api::stay.stay',
      'stay': 'api::stay.stay',
      'stays': 'api::stay.stay',
      
      // POI relations
      'poi': 'api::poi.poi',
      'pickedPOIs': 'api::poi.poi',
      'POIs': 'api::poi.poi',
      
      // Suite relations
      'suites': 'api::suite.suite',
      
      // POI Recommendation relations
      'recommendations': 'api::poi-recommendation.poi-recommendation'
    };
    
    const contentType = relationMappings[fieldName];
    if (!contentType) {
      console.log(`     ⚠️  Unknown relation field: '${fieldName}'`);
    }
    return contentType || 'unknown';
  }

  // ENHANCED: Process relation fields with comprehensive logging and mapping
  processRelationFields(data, locale, currentContentType) {
    console.log(`     🔍 Processing relations for ${currentContentType} in ${locale} locale...`);
    
    let relationStats = { total: 0, mapped: 0, unmapped: 0 };
    
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      
      if (Array.isArray(value)) {
        console.log(`       📋 Processing array relation '${key}' with ${value.length} items...`);
        const originalCount = value.length;
        relationStats.total += originalCount;
        
        data[key] = value.map(item => {
          if (typeof item === 'number') {
            // Handle direct ID references
            const relatedContentType = this.getContentTypeFromRelation(key);
            if (relatedContentType !== 'unknown') {
              const mappingKey = `${relatedContentType}_${item}`;
              const mappedId = this.idMappings.get(mappingKey);
              console.log(`         🔗 ID ${item} → ${mappedId || 'UNMAPPED'} (${relatedContentType})`);
              
              if (mappedId) {
                relationStats.mapped++;
                return mappedId;
              } else {
                relationStats.unmapped++;
                return null;
              }
            }
            return item;
          } else if (item && typeof item === 'object' && item.id) {
            // Handle object relations
            const relatedContentType = this.getContentTypeFromRelation(key);
            if (relatedContentType !== 'unknown') {
              const mappingKey = `${relatedContentType}_${item.id}`;
              const mappedId = this.idMappings.get(mappingKey);
              console.log(`         🔗 Object ID ${item.id} → ${mappedId || 'UNMAPPED'} (${relatedContentType})`);
              
              if (mappedId) {
                relationStats.mapped++;
                return mappedId;
              } else {
                relationStats.unmapped++;
                return null;
              }
            }
            return item;
          }
          return item;
        }).filter(item => item !== null);
        
        const newCount = data[key].length;
        console.log(`       📊 ${key}: ${originalCount} → ${newCount} relations (removed ${originalCount - newCount} unmapped)`);
        
      } else if (typeof value === 'number') {
        // Handle single ID relations
        console.log(`       🔗 Processing single ID relation '${key}': ${value}`);
        relationStats.total++;
        
        const relatedContentType = this.getContentTypeFromRelation(key);
        if (relatedContentType !== 'unknown') {
          const mappingKey = `${relatedContentType}_${value}`;
          const mappedId = this.idMappings.get(mappingKey);
          console.log(`         🔗 Single ID ${value} → ${mappedId || 'UNMAPPED'} (${relatedContentType})`);
          
          if (mappedId) {
            relationStats.mapped++;
            data[key] = mappedId;
          } else {
            relationStats.unmapped++;
            delete data[key]; // Remove unmapped relations
          }
        }
      } else if (value && typeof value === 'object' && value.id) {
        // Handle single object relations
        console.log(`       🔗 Processing single object relation '${key}': ${value.id}`);
        relationStats.total++;
        
        const relatedContentType = this.getContentTypeFromRelation(key);
        if (relatedContentType !== 'unknown') {
          const mappingKey = `${relatedContentType}_${value.id}`;
          const mappedId = this.idMappings.get(mappingKey);
          console.log(`         🔗 Object ID ${value.id} → ${mappedId || 'UNMAPPED'} (${relatedContentType})`);
          
          if (mappedId) {
            relationStats.mapped++;
            data[key] = mappedId;
          } else {
            relationStats.unmapped++;
            delete data[key]; // Remove unmapped relations
          }
        }
      }
    }
    
    // Update global relation stats
    this.results.relationStats.total += relationStats.total;
    this.results.relationStats.mapped += relationStats.mapped;
    this.results.relationStats.unmapped += relationStats.unmapped;
    
    console.log(`     📈 Relation processing stats: ${relationStats.mapped}/${relationStats.total} mapped, ${relationStats.unmapped} unmapped`);
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
      const cleanedData = this.cleanEntryData(entryData, phase, locale);
      
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
      const entryName = entry.name || entry.label || entry.title || `Entry ${entry.id}`;
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
      
      const entryName = entry.name || entry.label || entry.title || `Entry ${entry.id}`;
      console.log(`   Processing localizations for "${entryName}" (documentId: ${documentId})...`);
      
      for (const localization of entry.localizations) {
        const locale = localization.locale;
        if (!this.locales.includes(locale)) {
          console.log(`     ⚠️  Unsupported locale: ${locale}, skipping`);
          continue;
        }
        
        const localizedName = localization.name || localization.label || localization.title || `Localized ${localization.id}`;
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
      const entryName = entry.name || entry.label || entry.title || `Entry ${entry.id}`;
      
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
        
        const localizedName = localization.name || localization.label || localization.title || `Localized ${localization.id}`;
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

  // Generate detailed summary with relation statistics
  generateSummary() {
    console.log(`\n📊 DETAILED LITE RELATIONS MIGRATION SUMMARY`);
    console.log(`===============================================\n`);

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
              const name = original.name || original.label || original.title || `Entry ${original.id}`;
              console.log(`       ${index + 1}. "${name}" (${original.id} → ${created.id})`);
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
    console.log(`🔗 Relations processed: ${this.results.relationStats.mapped}/${this.results.relationStats.total} mapped, ${this.results.relationStats.unmapped} unmapped`);
  }

  // Main migration function
  async migrate() {
    console.log('🚀 Starting Lite Relations Tester Migration...\n');
    
    console.log('🎯 Test Configuration:');
    console.log(`   • Max Stays: ${this.maxStays}`);
    console.log(`   • Max POIs: ${this.maxPOIs}`);
    console.log(`   • Max Tag Labels: ${this.maxTagLabels}`);
    console.log(`   • Max POI Recommendations: ${this.maxPOIRecommendations}`);
    console.log(`   • Max Suites: ${this.maxSuites}`);
    console.log(`   • Locales: ${this.locales.join(', ')}`);
    console.log(`   • Focus: Test relation processing for poi, recommended_by, pickedPOIs, etc.`);
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
      const resultsPath = path.join(__dirname, 'lite-relations-tester-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      const mappingsPath = path.join(__dirname, 'lite-relations-tester-mappings.json');
      fs.writeFileSync(mappingsPath, JSON.stringify({
        idMappings: Object.fromEntries(this.idMappings),
        documentIdMappings: Object.fromEntries(this.documentIdMappings)
      }, null, 2));
      
      console.log('🎉 Lite Relations Tester migration completed!');
      console.log(`📊 Summary: ${totalSuccess} succeeded, ${totalFailed} failed out of ${totalSuccess + totalFailed} total operations`);
      console.log(`🔗 Relations Summary: ${this.results.relationStats.mapped}/${this.results.relationStats.total} relations mapped successfully`);
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
  const migrator = new LiteRelationsTesterMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = LiteRelationsTesterMigrator;
