#!/usr/bin/env node

/**
 * STEP 4: Components and Relations Migrator
 * Migrates hub-application-config Single Type and suite Collection Type with deep component population
 * Focus: Complete component migration with nested media relations using Strapi v5 populate syntax
 * Now includes: hub-application-config + suite component fields (faq, wifi, checkInOut, amenities, houseRules)
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class Step4ComponentsAndRelationsMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.step1Results = null;
    this.step1Mappings = null;
    this.mediaMappings = new Map();
    this.results = {
      hubConfig: { locales: {}, componentStats: { total: 0, processed: 0, migrated: 0, failed: 0 } },
      suite: { locales: {}, componentStats: { total: 0, processed: 0, migrated: 0, failed: 0 } },
      mediaStats: { total: 0, mapped: 0, unmapped: 0 },
      summary: { total: 0, success: 0, failed: 0 }
    };
    
    // All supported locales
    this.locales = ['en', 'zh-Hans', 'zh-Hant', 'ko', 'ja'];
    this.defaultLocale = 'en';
    
    // Content types configuration
    this.contentTypes = {
      hubConfig: {
        type: 'api::hub-application-config.hub-application-config',
        endpoint: 'hub-application-config',
        isCollection: false,
        componentFields: [
          'header',
          'pageLanding', 
          'pageLanguage',
          'universalConfig', // Correct field name from schema
          'pageSearch',
          'pageInfo',
          'pagPoiDetail',
          'globalComponent',
          'pageWiFi'
        ]
      },
      suite: {
        type: 'api::suite.suite',
        endpoint: 'suites',
        isCollection: true,
        componentFields: [
          'faq',        // component: stay.faq-item, repeatable, localized
          'wifi'        // component: stay.wi-fi-item, repeatable, not localized
        ],
        customFields: [
          'checkInOut', // customField: tinymce, localized
          'amenities',  // customField: tinymce, localized
          'houseRules'  // customField: tinymce, localized
        ]
      }
    };
    
    // Media mapping from previous steps - updated with actual field names
    this.mediaFieldsMap = {
      'icon': 'media',
      'leftIcon': 'media', 
      'rightIcon': 'media',
      'addressIcon': 'media',
      'urlIcon': 'media',
      'dialIcon': 'media'
    };
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
      const step1MappingsPath = path.join(__dirname, 'step1-en-content-mappings.json');
      const mediaMappingsPath = path.join(__dirname, 'mediaMappings.json');
      
      if (fs.existsSync(step1MappingsPath)) {
        this.step1Mappings = JSON.parse(fs.readFileSync(step1MappingsPath, 'utf8'));
        console.log(`📄 Loaded Step 1 mappings`);
      }
      
      if (fs.existsSync(mediaMappingsPath)) {
        const mediaData = JSON.parse(fs.readFileSync(mediaMappingsPath, 'utf8'));
        this.mediaMappings = new Map(Object.entries(mediaData));
        console.log(`🖼️  Loaded media mappings: ${this.mediaMappings.size} entries`);
      } else {
        console.log(`⚠️  No media mappings found. Media relations may not be properly mapped.`);
      }
      
    } catch (error) {
      console.log(`⚠️  Could not load previous steps results: ${error.message}`);
      console.log(`   This is not critical for hub-application-config migration.`);
    }
  }

  // Generate comprehensive populate parameter for hub-application-config (Strapi v5)
  generateHubConfigPopulateParam() {
    // Based on the actual API call structure, using correct field names
    const populateQuery = {
      // Universal Config (global settings)
      universalConfig: {
        populate: {
          releasedLanguages: {
            fields: ['label', 'value']
          }
        }
      },
      
      // Global Component
      globalComponent: {
        fields: ['readMoreLabel'],
        populate: {
          speechButton: {
            fields: ['label'],
            populate: {
              icon: {
                fields: ['url']
              }
            }
          }
        }
      },
      
      // Header
      header: {
        fields: ['leftRoute', 'rightRoute'],
        populate: {
          leftIcon: {
            fields: ['url']
          },
          rightIcon: {
            fields: ['url']
          }
        }
      },
      
      // Page Landing (fixed typo: naviagtion -> navigation)
      pageLanding: {
        fields: ['recommendationHeading'],
        populate: {
          naviagtion: { // Note: keeping the typo as it exists in schema
            fields: ['label', 'route'],
            populate: {
              icon: {
                fields: ['url']
              }
            }
          }
        }
      },
      
      // Page Language
      pageLanguage: {
        fields: ['heading'],
        populate: {
          applyButton: {
            fields: ['label']
          }
        }
      },
      
      // Page Search
      pageSearch: {
        fields: ['searchInputPlaceholder', 'defaultListHeading', 'highlightedListHeading'],
        populate: {
          defaultList: {
            fields: ['label', 'value']
          }
        }
      },
      
      // Page Info
      pageInfo: {
        fields: ['heading'],
        populate: {
          navigation: {
            fields: ['label', 'route'],
            populate: {
              icon: {
                fields: ['url']
              }
            }
          }
        }
      },
      
      // Page WiFi
      pageWiFi: {
        populate: {
          scanQRButton: {
            fields: ['label']
          },
          clipboardButton: {
            fields: ['label']
          },
          showQRButton: {
            fields: ['label']
          }
        }
      },
      
      // Page POI Detail
      pagPoiDetail: {
        fields: ['recommendationHeading', 'highlightHeading'],
        populate: {
          addressIcon: {
            fields: ['url']
          },
          urlIcon: {
            fields: ['url']
          },
          dialIcon: {
            fields: ['url']
          }
        }
      }
    };

    return populateQuery;
  }

  // Generate populate parameter for suite content type components
  generateSuitePopulateParam() {
    return {
      // Component fields (these go in populate)
      faq: {
        fields: ['question', 'answer']
      },
      wifi: {
        fields: ['network', 'password']
      },
      // Also populate the slider for media relations
      slider: {
        fields: ['url']
      }
    };
  }

  // Generate fields parameter for suite content type
  generateSuiteFieldsParam() {
    return [
      'name',
      'label', 
      'headline',
      'address',
      'addressURL',
      'addressEmbedHTML',
      'checkInOut',   // Custom field (tinymce)
      'amenities',    // Custom field (tinymce)
      'houseRules'    // Custom field (tinymce)
    ];
  }

  // Get source entry for hub-application-config with full component population
  async getHubConfigSourceEntry(locale = 'en') {
    try {
      const populateParam = this.generateHubConfigPopulateParam();
      const contentConfig = this.contentTypes.hubConfig;
      
      const url = `${this.source.url}/api/${contentConfig.endpoint}`;
      console.log(`         📥 Fetching ${locale} hub-application-config with full population...`);
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.sourceToken}` },
        params: { 
          populate: populateParam,
          locale: locale
        },
        timeout: 300000
      });
      
      console.log(`         ✅ Successfully fetched hub-application-config for ${locale}`);
      return response.data.data;
    } catch (error) {
      console.error(`❌ Error fetching hub-application-config for ${locale}:`, error.response?.data || error.message);
      return null;
    }
  }

  // Get source entries for suite content type with component population
  async getSuiteSourceEntries(locale = 'en') {
    try {
      const populateParam = this.generateSuitePopulateParam();
      const fieldsParam = this.generateSuiteFieldsParam();
      const contentConfig = this.contentTypes.suite;
      
      const url = `${this.source.url}/api/${contentConfig.endpoint}`;
      console.log(`         📥 Fetching ${locale} suite entries with component population...`);
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.sourceToken}` },
        params: { 
          fields: fieldsParam,
          populate: populateParam,
          locale: locale,
          pagination: { pageSize: 100 } // Get all entries
        },
        timeout: 300000
      });
      
      console.log(`         ✅ Successfully fetched ${response.data.data.length} suite entries for ${locale}`);
      return response.data.data;
    } catch (error) {
      console.error(`❌ Error fetching suite entries for ${locale}:`, error.response?.data || error.message);
      return [];
    }
  }

  // Process media fields in components and map IDs
  processMediaInComponent(component, componentName) {
    if (!component || typeof component !== 'object') return component;
    
    let mediaProcessed = 0;
    let mediaMapped = 0;
    
    const processedComponent = { ...component };
    
    // Remove ID fields from components as they can't be updated
    delete processedComponent.id;
    delete processedComponent.documentId;
    
    // Handle direct media fields
    for (const [fieldName, fieldType] of Object.entries(this.mediaFieldsMap)) {
      if (processedComponent[fieldName]) {
        this.results.mediaStats.total++;
        mediaProcessed++;
        
        if (Array.isArray(processedComponent[fieldName])) {
          // Handle media arrays
          processedComponent[fieldName] = processedComponent[fieldName].map(mediaItem => {
            if (mediaItem && typeof mediaItem === 'object' && mediaItem.id) {
              const mappedId = this.mediaMappings.get(mediaItem.id.toString());
              if (mappedId) {
                console.log(`         🖼️  Mapped media ${mediaItem.id} → ${mappedId} in ${componentName}.${fieldName}`);
                this.results.mediaStats.mapped++;
                mediaMapped++;
                return mappedId;
              } else {
                console.log(`         ⚠️  Unmapped media ${mediaItem.id} in ${componentName}.${fieldName}`);
                this.results.mediaStats.unmapped++;
                return null;
              }
            }
            return mediaItem;
          }).filter(item => item !== null);
        } else if (typeof processedComponent[fieldName] === 'object' && processedComponent[fieldName].id) {
          // Handle single media object
          const mediaItem = processedComponent[fieldName];
          const mappedId = this.mediaMappings.get(mediaItem.id.toString());
          if (mappedId) {
            console.log(`         🖼️  Mapped media ${mediaItem.id} → ${mappedId} in ${componentName}.${fieldName}`);
            this.results.mediaStats.mapped++;
            mediaMapped++;
            processedComponent[fieldName] = mappedId;
          } else {
            console.log(`         ⚠️  Unmapped media ${mediaItem.id} in ${componentName}.${fieldName}, removing`);
            this.results.mediaStats.unmapped++;
            delete processedComponent[fieldName];
          }
        }
      }
    }
    
    // Handle nested component arrays and objects (navigation buttons, speech buttons, etc.)
    for (const [key, value] of Object.entries(processedComponent)) {
      if (Array.isArray(value)) {
        // Handle arrays of components (like navigation, naviagtion, defaultList, etc.)
        processedComponent[key] = value.map(item => {
          if (item && typeof item === 'object') {
            return this.processMediaInComponent(item, `${componentName}.${key}`);
          }
          return item;
        });
      } else if (value && typeof value === 'object' && !this.mediaFieldsMap[key] && !value.url && !value.documentId) {
        // Handle nested component objects (like speechButton, applyButton, etc.)
        // Exclude objects that are media files or already processed
        processedComponent[key] = this.processMediaInComponent(value, `${componentName}.${key}`);
      }
    }
    
    console.log(`       📊 Processed ${mediaProcessed} media fields in ${componentName}, ${mediaMapped} mapped`);
    return processedComponent;
  }

  // Process all components in entry data
  processComponents(data, locale, contentTypeKey) {
    console.log(`     🔧 Processing components for ${locale} (${contentTypeKey})...`);
    
    const processedData = { ...data };
    let totalComponents = 0;
    let processedComponents = 0;
    
    const contentTypeConfig = this.contentTypes[contentTypeKey];
    const componentFields = contentTypeConfig.componentFields || [];
    const customFields = contentTypeConfig.customFields || [];
    
    // Process component fields
    for (const componentField of componentFields) {
      if (processedData[componentField]) {
        totalComponents++;
        console.log(`       🧩 Processing component: ${componentField}`);
        
        try {
          if (Array.isArray(processedData[componentField])) {
            // Handle repeatable components (like faq, wifi)
            processedData[componentField] = processedData[componentField].map((item, index) => {
              return this.processMediaInComponent(item, `${componentField}[${index}]`);
            });
          } else {
            // Handle single components
            processedData[componentField] = this.processMediaInComponent(
              processedData[componentField], 
              componentField
            );
          }
          processedComponents++;
          console.log(`       ✅ Successfully processed ${componentField}`);
        } catch (error) {
          console.log(`       ❌ Error processing component ${componentField}:`, error.message);
        }
      } else {
        console.log(`       ⚠️  Component field ${componentField} not found in data`);
      }
    }
    
    // Process custom fields (these are already processed data, just ensure they're included)
    for (const customField of customFields) {
      if (processedData[customField] !== undefined) {
        totalComponents++;
        console.log(`       📝 Processing custom field: ${customField}`);
        
        try {
          // Custom fields like TinyMCE don't need media processing, just pass through
          console.log(`       ✅ Custom field ${customField} ready for migration`);
          processedComponents++;
        } catch (error) {
          console.log(`       ❌ Error processing custom field ${customField}:`, error.message);
        }
      } else {
        console.log(`       ⚠️  Custom field ${customField} not found in data`);
      }
    }
    
    // Update component stats
    this.results[contentTypeKey].componentStats.total += totalComponents;
    this.results[contentTypeKey].componentStats.processed += processedComponents;
    
    console.log(`     📊 Component processing: ${processedComponents}/${totalComponents} fields processed`);
    
    return processedData;
  }

  // Migrate hub-application-config for a specific locale
  async migrateHubConfigLocale(locale) {
    try {
      console.log(`\n🚀 Migrating hub-application-config for ${locale}...`);
      
      // Initialize locale results
      if (!this.results.hubConfig.locales[locale]) {
        this.results.hubConfig.locales[locale] = {
          success: 0,
          failed: 0,
          errors: []
        };
      }
      
      // Get source entry with full population
      const sourceEntry = await this.getHubConfigSourceEntry(locale);
      if (!sourceEntry) {
        throw new Error(`Failed to fetch source entry for ${locale}`);
      }
      
      console.log(`     📦 Processing components and media relations...`);
      
      // Create a copy for processing (exclude metadata fields)
      const entryData = { ...sourceEntry };
      delete entryData.id;
      delete entryData.documentId;
      delete entryData.createdAt;
      delete entryData.updatedAt;
      delete entryData.publishedAt;
      delete entryData.createdBy;
      delete entryData.updatedBy;
      delete entryData.locale;
      delete entryData.localizations;
      
      // Process components and media relations
      const processedData = this.processComponents(entryData, locale, 'hubConfig');
      
      console.log(`     🔄 Updating destination entry for ${locale}...`);
      
      const contentConfig = this.contentTypes.hubConfig;
      
      // Update destination entry
      const response = await axios.put(`${this.destination.url}/api/${contentConfig.endpoint}?locale=${locale}`, {
        data: processedData
      }, {
        headers: { 
          Authorization: `Bearer ${this.destinationToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 300000
      });
      
      this.results.hubConfig.locales[locale].success++;
      this.results.hubConfig.componentStats.migrated++;
      
      console.log(`     ✅ Successfully migrated ${locale} hub-application-config`);
      return { success: true, data: response.data };
      
    } catch (error) {
      this.results.hubConfig.locales[locale].failed++;
      this.results.hubConfig.locales[locale].errors.push({
        locale: locale,
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      
      console.log(`     ❌ Failed to migrate ${locale}:`, JSON.stringify(error.response?.data || error.message));
      return { success: false, error: error.response?.data || error.message };
    }
  }

  // Migrate suite entries for a specific locale
  async migrateSuiteLocale(locale) {
    try {
      console.log(`\n🚀 Migrating suite components for ${locale}...`);
      
      // Initialize locale results
      if (!this.results.suite.locales[locale]) {
        this.results.suite.locales[locale] = {
          success: 0,
          failed: 0,
          errors: []
        };
      }
      
      // Get source entries with component population
      const sourceEntries = await this.getSuiteSourceEntries(locale);
      if (!sourceEntries || sourceEntries.length === 0) {
        console.log(`     ⚠️  No suite entries found for ${locale}`);
        return { success: true, message: 'No entries to migrate' };
      }
      
      console.log(`     📦 Processing ${sourceEntries.length} suite entries...`);
      
      const contentConfig = this.contentTypes.suite;
      let successCount = 0;
      let failedCount = 0;
      
      for (const sourceEntry of sourceEntries) {
        try {
          // Store documentId for URL but don't include in data
          const entryDocumentId = sourceEntry.documentId;
          
          // Create a copy for processing (exclude ALL metadata fields)
          const entryData = { ...sourceEntry };
          delete entryData.id;
          delete entryData.documentId;  // Critical: remove documentId from data payload
          delete entryData.createdAt;
          delete entryData.updatedAt;
          delete entryData.publishedAt;
          delete entryData.createdBy;
          delete entryData.updatedBy;
          delete entryData.locale;
          delete entryData.localizations;
          
          // Process components and media relations
          const processedData = this.processComponents(entryData, locale, 'suite');
          
          console.log(`       🔄 Updating suite entry ID: ${entryDocumentId}...`);
          console.log(`       🛠️  Debug - Data keys being sent:`, Object.keys(processedData));
          
          // Ensure no restricted fields are included
          const cleanData = { ...processedData };
          delete cleanData.documentId;
          delete cleanData.id;
          delete cleanData.createdAt;
          delete cleanData.updatedAt;
          delete cleanData.publishedAt;
          delete cleanData.createdBy;
          delete cleanData.updatedBy;
          delete cleanData.locale;
          delete cleanData.localizations;
          
          console.log(`       🛠️  Debug - Clean data keys:`, Object.keys(cleanData));
          
          // Update destination entry (use documentId in URL only)
          const response = await axios.put(`${this.destination.url}/api/${contentConfig.endpoint}/${entryDocumentId}?locale=${locale}`, {
            data: cleanData
          }, {
            headers: { 
              Authorization: `Bearer ${this.destinationToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 300000
          });
          
          successCount++;
          console.log(`       ✅ Successfully migrated suite entry ${entryDocumentId}`);
          
        } catch (error) {
          failedCount++;
          this.results.suite.locales[locale].errors.push({
            entryId: sourceEntry.documentId,
            locale: locale,
            error: error.response?.data || error.message,
            status: error.response?.status
          });
          
          console.log(`       ❌ Failed to migrate suite entry ${sourceEntry.documentId}:`, JSON.stringify(error.response?.data || error.message));
        }
        
        // Add small delay between entries
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      this.results.suite.locales[locale].success += successCount;
      this.results.suite.locales[locale].failed += failedCount;
      this.results.suite.componentStats.migrated += successCount;
      
      console.log(`     📊 Suite migration for ${locale}: ${successCount} success, ${failedCount} failed`);
      return { success: true, successCount, failedCount };
      
    } catch (error) {
      console.log(`     ❌ Failed to migrate suite for ${locale}:`, JSON.stringify(error.response?.data || error.message));
      return { success: false, error: error.response?.data || error.message };
    }
  }

  // Generate summary report
  generateSummary() {
    console.log(`\n📊 STEP 4: COMPONENTS AND RELATIONS MIGRATION SUMMARY`);
    console.log(`=========================================================\n`);

    console.log(`🔷 Hub Application Config Migration Results:`);
    
    for (const locale of this.locales) {
      const localeResult = this.results.hubConfig.locales[locale];
      if (localeResult && (localeResult.success > 0 || localeResult.failed > 0)) {
        console.log(`   ${locale}: ${localeResult.success} success, ${localeResult.failed} failed`);
        
        if (localeResult.errors.length > 0) {
          console.log(`     Errors:`);
          localeResult.errors.forEach((error, index) => {
            console.log(`       ${index + 1}. Status ${error.status}: ${JSON.stringify(error.error)}`);
          });
        }
      }
    }
    
    console.log(`\n🏠 Suite Content Type Migration Results:`);
    
    for (const locale of this.locales) {
      const localeResult = this.results.suite.locales[locale];
      if (localeResult && (localeResult.success > 0 || localeResult.failed > 0)) {
        console.log(`   ${locale}: ${localeResult.success} success, ${localeResult.failed} failed`);
        
        if (localeResult.errors.length > 0) {
          console.log(`     Errors:`);
          localeResult.errors.forEach((error, index) => {
            console.log(`       ${index + 1}. Entry ${error.entryId} - Status ${error.status}: ${JSON.stringify(error.error)}`);
          });
        }
      }
    }
    
    console.log(`\n🧩 Component Statistics:`);
    console.log(`   Hub Config - Total: ${this.results.hubConfig.componentStats.total}, Processed: ${this.results.hubConfig.componentStats.processed}, Migrated: ${this.results.hubConfig.componentStats.migrated}`);
    console.log(`   Suite - Total: ${this.results.suite.componentStats.total}, Processed: ${this.results.suite.componentStats.processed}, Migrated: ${this.results.suite.componentStats.migrated}`);
    
    console.log(`\n🖼️  Media Statistics:`);
    console.log(`   Total media fields: ${this.results.mediaStats.total}`);
    console.log(`   Media mapped: ${this.results.mediaStats.mapped}`);
    console.log(`   Media unmapped: ${this.results.mediaStats.unmapped}`);
    
    const mediaMapping = this.results.mediaStats.total > 0 
      ? ((this.results.mediaStats.mapped / this.results.mediaStats.total) * 100).toFixed(1)
      : 0;
    console.log(`   Media mapping success rate: ${mediaMapping}%`);
  }

  // Main migration function
  async migrate() {
    console.log('🚀 Starting STEP 4: Components and Relations Migration...\n');
    
    console.log('🎯 Step 4 Configuration:');
    console.log(`   • Hub Config Type: ${this.contentTypes.hubConfig.type} (Single Type)`);
    console.log(`   • Suite Type: ${this.contentTypes.suite.type} (Collection Type)`);
    console.log(`   • Locales: ${this.locales.join(', ')}`);
    console.log(`   • Focus: Component population with media relations`);
    console.log(`   • Hub Config Fields: ${this.contentTypes.hubConfig.componentFields.join(', ')}`);
    console.log(`   • Suite Component Fields: ${this.contentTypes.suite.componentFields.join(', ')}`);
    console.log(`   • Suite Custom Fields: ${this.contentTypes.suite.customFields.join(', ')}`);
    console.log(`   • Using Strapi v5 populate syntax\n`);
    
    try {
      await this.authenticate();
      this.loadPreviousStepsResults();
      
      // Migrate hub-application-config for each locale
      console.log('\n🔷 Starting Hub Application Config Migration...');
      for (const locale of this.locales) {
        await this.migrateHubConfigLocale(locale);
        
        // Add delay between locales to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Migrate suite components for each locale
      console.log('\n🏠 Starting Suite Components Migration...');
      for (const locale of this.locales) {
        await this.migrateSuiteLocale(locale);
        
        // Add delay between locales to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Calculate summary statistics
      let totalSuccess = 0;
      let totalFailed = 0;
      
      // Count hub config results
      for (const locale of Object.keys(this.results.hubConfig.locales)) {
        const localeResults = this.results.hubConfig.locales[locale];
        totalSuccess += localeResults.success;
        totalFailed += localeResults.failed;
      }
      
      // Count suite results
      for (const locale of Object.keys(this.results.suite.locales)) {
        const localeResults = this.results.suite.locales[locale];
        totalSuccess += localeResults.success;
        totalFailed += localeResults.failed;
      }
      
      this.results.summary = {
        total: totalSuccess + totalFailed,
        success: totalSuccess,
        failed: totalFailed
      };
      
      // Generate detailed summary
      this.generateSummary();
      
      // Save final results
      const resultsPath = path.join(__dirname, 'step4-components-and-relations-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      console.log('\n🎉 Step 4: Components and Relations migration completed!');
      console.log(`📊 Summary: ${totalSuccess} succeeded, ${totalFailed} failed out of ${totalSuccess + totalFailed} total operations`);
      
      const totalHubComponents = this.results.hubConfig.componentStats.migrated;
      const totalSuiteComponents = this.results.suite.componentStats.migrated;
      console.log(`🧩 Components: ${totalHubComponents} hub config + ${totalSuiteComponents} suite components migrated successfully`);
      console.log(`🖼️  Media: ${this.results.mediaStats.mapped}/${this.results.mediaStats.total} media relations mapped`);
      console.log(`💾 Results saved to: ${resultsPath}`);
      console.log(`\n✅ 4-STEP MIGRATION COMPLETE!`);
      
    } catch (error) {
      console.error('❌ Step 4 migration failed:', error);
      throw error;
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new Step4ComponentsAndRelationsMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = Step4ComponentsAndRelationsMigrator;
