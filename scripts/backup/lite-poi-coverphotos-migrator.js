#!/usr/bin/env node

/**
 * Lite POI CoverPhotos Migrator - Demo Version
 * Migrates 5 POIs with all localizations and ensures coverPhoto fields are properly handled
 * Based on media-migrator.js and lite-poi-migrator-fixed.js
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class LitePOICoverPhotosMigrator {
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
      mediaProcessed: { total: 0, mapped: 0, unmapped: 0 }
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
      } else {
        console.warn('⚠️  No media mappings found. Please run media-migrator.js first.');
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
    
    console.log(`   📊 Found ${allEntries.length} ${contentType} entries (limited to ${maxEntries} for demo)`);
    
    // Log entries for debugging with coverPhoto info
    if (allEntries.length > 0) {
      console.log(`   🎯 Demo entries with media analysis:`);
      allEntries.forEach((entry, index) => {
        const localizationCount = entry.localizations ? entry.localizations.length : 0;
        const entryName = entry.name || entry.label || `Entry ${entry.id}`;
        const coverPhotoInfo = this.analyzeCoverPhoto(entry.coverPhoto);
        console.log(`     ${index + 1}. "${entryName}" (ID: ${entry.id}) - ${localizationCount} localizations`);
        console.log(`        📸 CoverPhoto: ${coverPhotoInfo}`);
      });
    }
    
    return allEntries;
  }

  // Analyze coverPhoto field for debugging
  analyzeCoverPhoto(coverPhoto) {
    if (!coverPhoto) return 'None';
    if (typeof coverPhoto === 'number') return `ID: ${coverPhoto}`;
    if (coverPhoto.id) {
      const mediaType = coverPhoto.mime ? ` (${coverPhoto.mime})` : '';
      const url = coverPhoto.url ? ` - ${coverPhoto.url.substring(0, 50)}...` : '';
      return `Object ID: ${coverPhoto.id}${mediaType}${url}`;
    }
    return 'Unknown format';
  }

  // Enhanced media field processing with detailed logging
  processMediaFields(data, phase = 'creation') {
    const mediaStats = { total: 0, mapped: 0, unmapped: 0 };
    
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      
      if (Array.isArray(value)) {
        console.log(`     📋 Processing media array '${key}' with ${value.length} items...`);
        data[key] = value.map((item, index) => {
          if (item && typeof item === 'object' && item.id) {
            // Enhanced media detection
            if (this.isMediaObject(item)) {
              mediaStats.total++;
              const mappedId = this.mediaMapping.get(item.id.toString());
              if (mappedId) {
                mediaStats.mapped++;
                console.log(`       📸 [${index}] Media ${item.id} → ${mappedId} (${item.name || 'unknown'})`);
                return parseInt(mappedId);
              } else {
                mediaStats.unmapped++;
                console.log(`       ⚠️  [${index}] Unmapped media ${item.id} (${item.name || 'unknown'})`);
                return item.id;
              }
            }
          }
          return item;
        });
      } else if (value && typeof value === 'object' && value.id) {
        // Enhanced single media object detection
        if (this.isMediaObject(value)) {
          mediaStats.total++;
          const mappedId = this.mediaMapping.get(value.id.toString());
          if (mappedId) {
            mediaStats.mapped++;
            console.log(`     📸 Media field '${key}': ${value.id} → ${mappedId} (${value.name || 'unknown'})`);
            data[key] = parseInt(mappedId);
          } else {
            mediaStats.unmapped++;
            console.log(`     ⚠️  Unmapped media field '${key}': ${value.id} (${value.name || 'unknown'})`);
            data[key] = value.id;
          }
        }
      }
    }
    
    // Update global media stats
    this.results.mediaProcessed.total += mediaStats.total;
    this.results.mediaProcessed.mapped += mediaStats.mapped;
    this.results.mediaProcessed.unmapped += mediaStats.unmapped;
    
    if (mediaStats.total > 0) {
      console.log(`     📊 Media processed: ${mediaStats.mapped}/${mediaStats.total} mapped, ${mediaStats.unmapped} unmapped`);
    }
  }

  // Enhanced media object detection
  isMediaObject(obj) {
    if (!obj || typeof obj !== 'object' || !obj.id) return false;
    
    // Check for typical media properties
    return !!(
      obj.url ||           // Has URL
      obj.mime ||          // Has MIME type
      obj.formats ||       // Has image formats
      obj.provider ||      // Has provider info
      obj.size ||          // Has file size
      obj.ext ||           // Has file extension
      obj.alternativeText  // Has alt text
    );
  }

  // Clean entry data for migration with enhanced media handling
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
    
    // Note: In Strapi, different locales can share the same slug
    // No slug modification needed for localizations
    
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
    const relationFields = ['pickedPOIs', 'tag_labels', 'ownedBy', 'poi', 'recommendedBy'];
    relationFields.forEach(field => {
      delete data[field];
    });
    
    // Remove nested objects that look like relations (but not media)
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.id !== undefined && !this.isMediaObject(value)) {
          delete data[key];
        }
      } else if (Array.isArray(value)) {
        const hasRelations = value.some(item => 
          item && typeof item === 'object' && item.id !== undefined && !this.isMediaObject(item)
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
              console.log(`         🔗 ID ${item} → ${mappedId || 'UNMAPPED'}`);
              return mappedId || null;
            }
            return item;
          } else if (item && typeof item === 'object' && item.id) {
            // Handle object relations
            const relatedContentType = this.getContentTypeFromRelation(key);
            if (relatedContentType !== 'unknown') {
              const mappingKey = `${relatedContentType}_${item.id}`;
              const mappedId = this.idMappings.get(mappingKey);
              console.log(`         🔗 Object ID ${item.id} → ${mappedId || 'UNMAPPED'}`);
              return mappedId || null;
            }
            return item;
          }
          return item;
        }).filter(item => item !== null);
        
        const newCount = data[key].length;
        console.log(`       📊 ${key}: ${originalCount} → ${newCount} relations (removed ${originalCount - newCount} unmapped)`);
        
      } else if (typeof value === 'number') {
        // Handle single ID relations
        const relatedContentType = this.getContentTypeFromRelation(key);
        if (relatedContentType !== 'unknown') {
          const mappingKey = `${relatedContentType}_${value}`;
          const mappedId = this.idMappings.get(mappingKey);
          console.log(`       🔗 Single ID ${key}: ${value} → ${mappedId || 'UNMAPPED'}`);
          
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
          console.log(`       🔗 Single Object ${key}: ${value.id} → ${mappedId || 'UNMAPPED'}`);
          
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
        
        // Log coverPhoto status for POIs
        if (contentType === 'api::poi.poi' && newEntry.coverPhoto) {
          console.log(`     📸 CoverPhoto migrated: ${newEntry.coverPhoto}`);
        }
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
          
          // Log coverPhoto status for POI localizations
          if (contentType === 'api::poi.poi' && newEntry.coverPhoto) {
            console.log(`       📸 CoverPhoto migrated: ${newEntry.coverPhoto}`);
          }
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

  // Generate detailed summary with media statistics
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
              const coverPhotoStatus = created.coverPhoto ? ` [📸 CoverPhoto: ${created.coverPhoto}]` : '';
              console.log(`       ${index + 1}. "${name}" (${original.id} → ${created.id})${coverPhotoStatus}`);
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
    console.log(`📸 Media processed: ${this.results.mediaProcessed.mapped}/${this.results.mediaProcessed.total} mapped, ${this.results.mediaProcessed.unmapped} unmapped`);
  }

  // Main migration function
  async migrate() {
    console.log('🚀 Starting Lite POI CoverPhotos Migration (Demo Version)...\n');
    
    console.log('🎯 Demo Configuration:');
    console.log(`   • Max POIs: ${this.maxPOIs}`);
    console.log(`   • Max Tag Labels: ${this.maxTagLabels}`);
    console.log(`   • Locales: ${this.locales.join(', ')}`);
    console.log(`   • Focus: POI coverPhoto field migration`);
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
      const resultsPath = path.join(__dirname, 'lite-poi-coverphotos-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      const mappingsPath = path.join(__dirname, 'lite-poi-coverphotos-mappings.json');
      fs.writeFileSync(mappingsPath, JSON.stringify({
        idMappings: Object.fromEntries(this.idMappings),
        documentIdMappings: Object.fromEntries(this.documentIdMappings)
      }, null, 2));
      
      console.log('🎉 Lite CoverPhotos migration completed!');
      console.log(`📊 Summary: ${totalSuccess} succeeded, ${totalFailed} failed out of ${totalSuccess + totalFailed} total operations`);
      console.log(`📸 Media Summary: ${this.results.mediaProcessed.mapped}/${this.results.mediaProcessed.total} media fields mapped successfully`);
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
  const migrator = new LitePOICoverPhotosMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = LitePOICoverPhotosMigrator;
