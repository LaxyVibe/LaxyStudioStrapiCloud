#!/usr/bin/env node

/**
 * STEP 4: Hub Application Config Components Migrator
 * Migrates hub-application-config Single Type with deep component population
 * Focus: Complete component migration with nested media relations using Strapi v5 populate syntax
 */

const config = require('./migration-config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class Step4HubConfigComponentsMigrator {
  constructor() {
    this.source = config.source;
    this.destination = config.destination;
    this.sourceToken = null;
    this.destinationToken = null;
    this.step1Results = null;
    this.step1Mappings = null;
    this.mediaMappings = new Map();
    this.results = {
      locales: {},
      componentStats: { total: 0, processed: 0, migrated: 0, failed: 0 },
      mediaStats: { total: 0, mapped: 0, unmapped: 0 },
      summary: { total: 0, success: 0, failed: 0 }
    };
    
    // All supported locales
    this.locales = ['en', 'zh-Hans', 'zh-Hant', 'ko', 'ja'];
    this.defaultLocale = 'en';
    
    // Single Type configuration
    this.contentType = 'api::hub-application-config.hub-application-config';
    this.endpoint = 'hub-application-config';
    
    // Component fields that contain media or nested relations
    this.componentFields = [
      'header',
      'pageLanding', 
      'pageLanguage',
      'universalConfig', // Correct field name from schema
      'pageSearch',
      'pageInfo',
      'pagPoiDetail',
      'globalComponent',
      'pageWiFi'
    ];
    
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

  // Generate comprehensive populate parameter for Strapi v5
  generatePopulateParam() {
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

  // Get source entry with full component population
  async getSourceEntry(locale = 'en') {
    try {
      const populateParam = this.generatePopulateParam();
      
      const url = `${this.source.url}/api/${this.endpoint}`;
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
  processComponents(data, locale) {
    console.log(`     🔧 Processing components for ${locale}...`);
    
    const processedData = { ...data };
    let totalComponents = 0;
    let processedComponents = 0;
    
    // Process each component field
    for (const componentField of this.componentFields) {
      if (processedData[componentField]) {
        totalComponents++;
        console.log(`       🧩 Processing component: ${componentField}`);
        
        try {
          processedData[componentField] = this.processMediaInComponent(
            processedData[componentField], 
            componentField
          );
          processedComponents++;
          console.log(`       ✅ Successfully processed ${componentField}`);
        } catch (error) {
          console.log(`       ❌ Error processing component ${componentField}:`, error.message);
        }
      } else {
        console.log(`       ⚠️  Component field ${componentField} not found in data`);
      }
    }
    
    // Update component stats
    this.results.componentStats.total += totalComponents;
    this.results.componentStats.processed += processedComponents;
    
    console.log(`     📊 Component processing: ${processedComponents}/${totalComponents} components processed`);
    
    return processedData;
  }

  // Migrate hub-application-config for a specific locale
  async migrateLocale(locale) {
    try {
      console.log(`\n🚀 Migrating hub-application-config for ${locale}...`);
      
      // Initialize locale results
      if (!this.results.locales[locale]) {
        this.results.locales[locale] = {
          success: 0,
          failed: 0,
          errors: []
        };
      }
      
      // Get source entry with full population
      const sourceEntry = await this.getSourceEntry(locale);
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
      const processedData = this.processComponents(entryData, locale);
      
      console.log(`     🔄 Updating destination entry for ${locale}...`);
      console.log(`     📝 Data to migrate:`, JSON.stringify(processedData, null, 2));
      
      // Update destination entry
      const response = await axios.put(`${this.destination.url}/api/${this.endpoint}?locale=${locale}`, {
        data: processedData
      }, {
        headers: { 
          Authorization: `Bearer ${this.destinationToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 300000
      });
      
      this.results.locales[locale].success++;
      this.results.componentStats.migrated++;
      
      console.log(`     ✅ Successfully migrated ${locale} hub-application-config`);
      return { success: true, data: response.data };
      
    } catch (error) {
      this.results.locales[locale].failed++;
      this.results.locales[locale].errors.push({
        locale: locale,
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      
      console.log(`     ❌ Failed to migrate ${locale}:`, JSON.stringify(error.response?.data || error.message));
      return { success: false, error: error.response?.data || error.message };
    }
  }

  // Generate summary report
  generateSummary() {
    console.log(`\n📊 STEP 4: HUB APPLICATION CONFIG COMPONENTS MIGRATION SUMMARY`);
    console.log(`==============================================================\n`);

    console.log(`🔷 Hub Application Config Migration Results:`);
    
    for (const locale of this.locales) {
      const localeResult = this.results.locales[locale];
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
    
    console.log(`\n🧩 Component Statistics:`);
    console.log(`   Total components found: ${this.results.componentStats.total}`);
    console.log(`   Components processed: ${this.results.componentStats.processed}`);
    console.log(`   Components migrated: ${this.results.componentStats.migrated}`);
    console.log(`   Components failed: ${this.results.componentStats.failed}`);
    
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
    console.log('🚀 Starting STEP 4: Hub Application Config Components Migration...\n');
    
    console.log('🎯 Step 4 Configuration:');
    console.log(`   • Content Type: ${this.contentType} (Single Type)`);
    console.log(`   • Locales: ${this.locales.join(', ')}`);
    console.log(`   • Focus: Component population with media relations`);
    console.log(`   • Component Fields: ${this.componentFields.join(', ')}`);
    console.log(`   • Using Strapi v5 populate syntax\n`);
    
    try {
      await this.authenticate();
      this.loadPreviousStepsResults();
      
      // Migrate for each locale
      for (const locale of this.locales) {
        await this.migrateLocale(locale);
        
        // Add delay between locales to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Calculate summary statistics
      let totalSuccess = 0;
      let totalFailed = 0;
      
      for (const locale of Object.keys(this.results.locales)) {
        const localeResults = this.results.locales[locale];
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
      const resultsPath = path.join(__dirname, 'step4-hub-config-components-results.json');
      fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
      
      console.log('\n🎉 Step 4: Hub Application Config Components migration completed!');
      console.log(`📊 Summary: ${totalSuccess} succeeded, ${totalFailed} failed out of ${totalSuccess + totalFailed} total operations`);
      console.log(`🧩 Components: ${this.results.componentStats.migrated} components migrated successfully`);
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
  const migrator = new Step4HubConfigComponentsMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = Step4HubConfigComponentsMigrator;
