#!/usr/bin/env node

/**
 * STEP 3: Relations Migrator
 * Updates all relations for all content in all locales based on Steps 1 & 2 results
 * Focus: Complete relation mapping and processing
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class Step3RelationsMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.step1Results = null;
    this.step1Mappings = null;
    this.step2Results = null;
    this.allIdMappings = new Map();
    this.allDocumentIdMappings = new Map();
    this.results = {
      locales: {},
      relationStats: { total: 0, mapped: 0, unmapped: 0 },
      summary: { total: 0, success: 0, failed: 0 }
    };
    
    // All supported locales
    this.locales = ['en', 'zh-Hans', 'zh-Hant', 'ko', 'ja'];
    this.defaultLocale = 'en';
    
    // Content type to endpoint mapping (excludes hub-application-config - handled by Step 4)
    this.contentTypeEndpoints = {
      'api::tag-label.tag-label': 'tag-labels',
      'api::stay.stay': 'stays',
      'api::poi.poi': 'pois',
      'api::suite.suite': 'suites',
      'api::poi-recommendation.poi-recommendation': 'poi-recommendations'
    };
    
    // Migration order - same as steps 1 & 2 (excludes hub-application-config)
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

  loadPreviousStepsResults() {
    try {
      const step1ResultsPath = path.join(__dirname, 'step1-en-content-results.json');
      const step1MappingsPath = path.join(__dirname, 'step1-en-content-mappings.json');
      const step2ResultsPath = path.join(__dirname, 'step2-non-en-localizations-results.json');
      
      if (!fs.existsSync(step1ResultsPath) || !fs.existsSync(step1MappingsPath)) {
        throw new Error('Step 1 results not found. Please run step1-en-content-migrator.js first.');
      }
      
      if (!fs.existsSync(step2ResultsPath)) {
        throw new Error('Step 2 results not found. Please run step2-non-en-localizations-migrator.js first.');
      }
      
      this.step1Results = JSON.parse(fs.readFileSync(step1ResultsPath, 'utf8'));
      this.step1Mappings = JSON.parse(fs.readFileSync(step1MappingsPath, 'utf8'));
      this.step2Results = JSON.parse(fs.readFileSync(step2ResultsPath, 'utf8'));
      
      console.log(`📄 Loaded Step 1 results: ${this.step1Results.summary.success} English entries`);
      console.log(`📄 Loaded Step 2 results: ${this.step2Results.summary.success} localized entries`);
      
      // Combine all ID mappings from steps 1 and 2
      this.allIdMappings = new Map(Object.entries(this.step1Mappings.idMappings));
      this.allDocumentIdMappings = new Map(Object.entries(this.step1Mappings.documentIdMappings));
      
      // Add Step 2 localization mappings to the ID mappings
      console.log(`🔗 Adding Step 2 localization mappings...`);
      for (const contentType of Object.keys(this.step2Results.locales)) {
        for (const locale of Object.keys(this.step2Results.locales[contentType])) {
          const localeResults = this.step2Results.locales[contentType][locale];
          for (const entry of localeResults.entries) {
            // Create mapping from source localization ID to destination ID
            const mappingKey = `${contentType}_${entry.originalId}`;
            this.allIdMappings.set(mappingKey, entry.newId);
            console.log(`     🔗 ${mappingKey} → ${entry.newId} (${locale})`);
          }
        }
      }
      
      console.log(`🗺️  Combined ID mappings: ${this.allIdMappings.size} total`);
      console.log(`📄 Combined Document ID mappings: ${this.allDocumentIdMappings.size} total`);
      
    } catch (error) {
      throw new Error(`Failed to load previous steps results: ${error.message}`);
    }
  }

  // Get source entry with all relations by documentId + locale
  async getSourceEntryWithRelations(contentType, entryDocumentId, locale = 'en') {
    const endpoint = this.contentTypeEndpoints[contentType];
    
    try {
      // Always use documentId for Strapi v5 compatibility
      const url = `${this.source.url}/api/${endpoint}/${entryDocumentId}`;
      console.log(`         📥 Fetching ${locale} entry using documentId: ${entryDocumentId}...`);
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.sourceToken}` },
        params: { 
          'populate': '*',
          'locale': locale
        },
        timeout: 300000
      });
      
      return response.data.data;
    } catch (error) {
      console.error(`❌ Error fetching entry ${entryDocumentId} in ${locale}:`, error.response?.data || error.message);
      return null;
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
        console.log(`       🔄 Processing relation field '${field}'...`);
        
        // Convert relation objects to IDs if needed
        if (Array.isArray(data[field])) {
          relationData[field] = data[field].map(item => {
            if (item && typeof item === 'object' && item.id) {
              console.log(`         📝 Array item: object ID ${item.id} → ${item.id}`);
              return item.id; // Extract ID from object
            }
            console.log(`         📝 Array item: direct value ${item}`);
            return item; // Keep as-is if already an ID
          });
        } else if (data[field] && typeof data[field] === 'object' && data[field].id) {
          console.log(`         📝 Single object: ID ${data[field].id} → ${data[field].id}`);
          relationData[field] = data[field].id; // Extract ID from object
        } else {
          console.log(`         📝 Direct value: ${data[field]}`);
          relationData[field] = data[field]; // Keep as-is
        }
      }
    });
    
    // Clear original data and copy only relations
    Object.keys(data).forEach(key => delete data[key]);
    Object.assign(data, relationData);
    
    console.log(`       📊 Relation fields prepared: ${Object.keys(relationData).join(', ')}`);
    return relationData;
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
      console.log(`       ⚠️  Unknown relation field: '${fieldName}'`);
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
              const mappedId = this.allIdMappings.get(mappingKey);
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
              const mappedId = this.allIdMappings.get(mappingKey);
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
          const mappedId = this.allIdMappings.get(mappingKey);
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
          const mappedId = this.allIdMappings.get(mappingKey);
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
    
    console.log(`       📈 Relation processing stats: ${relationStats.mapped}/${relationStats.total} mapped, ${relationStats.unmapped} unmapped`);
    return relationStats;
  }

  // Update relations for a specific entry
  async updateEntryRelations(contentType, sourceDocumentId, destinationDocumentId, locale) {
    try {
      const endpoint = this.contentTypeEndpoints[contentType];
      
      // Get source entry with relations - use enhanced method
      const sourceEntry = await this.getSourceEntryWithRelations(contentType, sourceDocumentId, locale);
      if (!sourceEntry) {
        return { success: false, error: 'Failed to fetch source entry' };
      }
      
      // Extract only relation fields
      const relationData = { ...sourceEntry };
      this.keepOnlyRelationFields(relationData);
      
      // Skip if no relations to process
      if (Object.keys(relationData).length === 0) {
        console.log(`       ⏭️  No relations to process for ${locale}`);
        return { success: true, skipped: true };
      }
      
      // Process relations with mapping
      this.processRelationFields(relationData, locale, contentType);
      
      // Skip if no relations remain after processing
      if (Object.keys(relationData).length === 0) {
        console.log(`       ⏭️  No relations remain after processing for ${locale}`);
        return { success: true, skipped: true };
      }
      
      console.log(`       🔗 Updating relations with data:`, JSON.stringify(relationData, null, 2));
      
      const response = await axios.put(`${this.destination.url}/api/${endpoint}/${destinationDocumentId}?locale=${locale}`, {
        data: relationData
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

  // Migrate relations for a content type
  async migrateContentTypeRelations(contentType) {
    console.log(`\n🚀 Starting Step 3 relations migration for ${contentType}...`);
    
    // Initialize results
    if (!this.results.locales[contentType]) {
      this.results.locales[contentType] = {};
      this.locales.forEach(locale => {
        this.results.locales[contentType][locale] = {
          success: 0, failed: 0, skipped: 0, errors: []
        };
      });
    }
    
    // Get step 1 results for this content type
    const step1TypeResults = this.step1Results.contentTypes[contentType];
    if (!step1TypeResults || step1TypeResults.sourceEntries.length === 0) {
      console.log(`⚪ No entries found for ${contentType} in Step 1 results`);
      return;
    }
    
    console.log(`📊 Processing relations for ${step1TypeResults.sourceEntries.length} entries...`);
    
    // Update relations for English entries first
    console.log(`   🇺🇸 Updating English relations...`);
    for (const sourceEntry of step1TypeResults.sourceEntries) {
      const documentId = this.allDocumentIdMappings.get(`${contentType}_${sourceEntry.id}`);
      if (!documentId) {
        console.log(`     ⚠️  No documentId found for entry ${sourceEntry.id}, skipping`);
        continue;
      }
      
      console.log(`     📝 Updating English relations for "${sourceEntry.name}" (ID: ${sourceEntry.id}, docId: ${documentId})...`);
      
      // For English entries, use the source documentId stored in Step 1
      const result = await this.updateEntryRelations(contentType, sourceEntry.documentId, documentId, this.defaultLocale);
      const localeResults = this.results.locales[contentType][this.defaultLocale];
      
      if (result.success && !result.skipped) {
        localeResults.success++;
        console.log(`       ✅ Updated English relations`);
      } else if (result.skipped) {
        localeResults.skipped++;
        console.log(`       ⏭️  Skipped (no relations)`);
      } else {
        localeResults.failed++;
        localeResults.errors.push({
          sourceId: sourceEntry.id,
          name: sourceEntry.name,
          error: result.error
        });
        console.log(`       ❌ Failed:`, JSON.stringify(result.error));
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Update relations for localized entries
    console.log(`   🌐 Updating localized relations...`);
    for (const sourceEntry of step1TypeResults.sourceEntries) {
      if (!sourceEntry.localizations || sourceEntry.localizations.length === 0) {
        continue;
      }
      
      const documentId = this.allDocumentIdMappings.get(`${contentType}_${sourceEntry.id}`);
      if (!documentId) continue;
      
      console.log(`     📝 Processing localizations for "${sourceEntry.name}"...`);
      
      for (const localizationInfo of sourceEntry.localizations) {
        const locale = localizationInfo.locale;
        
        if (!this.locales.includes(locale)) {
          console.log(`       ⚠️  Unsupported locale: ${locale}, skipping`);
          continue;
        }
        
        console.log(`       🌐 Updating ${locale} relations (ID: ${localizationInfo.id})...`);
        
        // For localized entries, use the localization's documentId
        const result = await this.updateEntryRelations(contentType, localizationInfo.documentId, documentId, locale);
        const localeResults = this.results.locales[contentType][locale];
        
        if (result.success && !result.skipped) {
          localeResults.success++;
          console.log(`         ✅ Updated ${locale} relations`);
        } else if (result.skipped) {
          localeResults.skipped++;
          console.log(`         ⏭️  Skipped (no relations)`);
        } else {
          localeResults.failed++;
          localeResults.errors.push({
            sourceId: localizationInfo.id,
            locale: locale,
            error: result.error
          });
          console.log(`         ❌ Failed:`, JSON.stringify(result.error));
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  // Generate summary
  generateSummary() {
    console.log(`\n📊 STEP 3: RELATIONS MIGRATION SUMMARY`);
    console.log(`=====================================\n`);

    for (const contentType of this.migrationOrder) {
      const typeResults = this.results.locales[contentType];
      if (!typeResults) continue;

      console.log(`🔷 ${contentType}:`);

      for (const locale of this.locales) {
        const localeResult = typeResults[locale];
        if (localeResult.success > 0 || localeResult.failed > 0 || localeResult.skipped > 0) {
          console.log(`   ${locale}: ${localeResult.success} success, ${localeResult.failed} failed, ${localeResult.skipped} skipped`);
          
          if (localeResult.errors.length > 0) {
            console.log(`     Errors:`);
            localeResult.errors.forEach((error, index) => {
              console.log(`       ${index + 1}. ${error.name || `ID ${error.sourceId}`}: ${JSON.stringify(error.error)}`);
            });
          }
        }
      }
      console.log('');
    }

    console.log(`🔗 Relations processed: ${this.results.relationStats.mapped}/${this.results.relationStats.total} mapped, ${this.results.relationStats.unmapped} unmapped`);
    
    const mappingPercentage = this.results.relationStats.total > 0 
      ? ((this.results.relationStats.mapped / this.results.relationStats.total) * 100).toFixed(1)
      : 0;
    console.log(`📈 Relation mapping success rate: ${mappingPercentage}%`);
  }

  // Main migration function
  async migrate() {
    console.log('🚀 Starting STEP 3: Relations Migration...\n');
    
    console.log('🎯 Step 3 Configuration:');
    console.log(`   • Locales: ${this.locales.join(', ')}`);
    console.log(`   • Based on: Steps 1 & 2 content results`);
    console.log(`   • Focus: Complete relation mapping and processing`);
    console.log(`   • Migration order: ${this.migrationOrder.join(' → ')}\n`);
    
    try {
      await this.authenticate();
      this.loadPreviousStepsResults();
      
      // Migrate relations for each content type in dependency order
      for (const contentType of this.migrationOrder) {
        await this.migrateContentTypeRelations(contentType);
      }
      
      // Calculate summary
      let totalSuccess = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      
      for (const contentType of Object.keys(this.results.locales)) {
        for (const locale of Object.keys(this.results.locales[contentType])) {
          const localeResults = this.results.locales[contentType][locale];
          totalSuccess += localeResults.success;
          totalFailed += localeResults.failed;
          totalSkipped += localeResults.skipped;
        }
      }
      
      this.results.summary = {
        total: totalSuccess + totalFailed + totalSkipped,
        success: totalSuccess,
        failed: totalFailed,
        skipped: totalSkipped
      };
      
      // Generate detailed summary
      this.generateSummary();
      
      // Save final results
      const resultsPath = path.join(__dirname, 'step3-relations-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      console.log('🎉 Step 3: Relations migration completed!');
      console.log(`📊 Summary: ${totalSuccess} succeeded, ${totalFailed} failed, ${totalSkipped} skipped out of ${totalSuccess + totalFailed + totalSkipped} total operations`);
      console.log(`🔗 Relations Summary: ${this.results.relationStats.mapped}/${this.results.relationStats.total} relations mapped successfully`);
      console.log(`💾 Results saved to: ${resultsPath}`);
      console.log(`\n✅ 3-STEP MIGRATION COMPLETE!`);
      
    } catch (error) {
      console.error('❌ Step 3 migration failed:', error);
      throw error;
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new Step3RelationsMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = Step3RelationsMigrator;
