/**
 * Content Migrator - Migrate content entries between Strapi instances
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ContentMigrator {
  constructor(sourceConfig, destinationConfig) {
    this.source = sourceConfig;
    this.destination = destinationConfig;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMapping = new Map();
    this.contentMapping = new Map(); // Map source content ID to destination content ID
    this.migrationOrder = [];
  }

  async authenticate() {
    console.log('🔐 Authenticating for content migration...');
    
    // Check if we have API tokens or need to use username/password
    if (this.source.apiToken) {
      this.sourceToken = this.source.apiToken;
      console.log('✅ Source content authentication using API token');
    } else {
      // Authenticate with source using username/password
      const sourceAuth = await axios.post(`${this.source.url}/api/auth/local`, {
        identifier: this.source.username,
        password: this.source.password
      });
      this.sourceToken = sourceAuth.data.jwt;
      console.log('✅ Source content authentication successful');
    }

    if (this.destination.apiToken) {
      this.destinationToken = this.destination.apiToken;
      console.log('✅ Destination content authentication using API token');
    } else {
      // Authenticate with destination using username/password
      const destAuth = await axios.post(`${this.destination.url}/api/auth/local`, {
        identifier: this.destination.username,
        password: this.destination.password
      });
      this.destinationToken = destAuth.data.jwt;
      console.log('✅ Destination content authentication successful');
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

  async getContentTypes() {
    try {
      const response = await axios.get(`${this.source.url}/api/content-type-builder/content-types`, {
        headers: { Authorization: `Bearer ${this.sourceToken}` }
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching content types:', error.response?.data || error.message);
      return [];
    }
  }

  determineMigrationOrder(contentTypes) {
    // Sort content types by dependency:
    // 1. Single types (no dependencies)
    // 2. Collection types without relations
    // 3. Collection types with relations (sorted by dependency depth)
    
    const singleTypes = contentTypes.filter(ct => ct.schema.kind === 'singleType');
    const collectionTypes = contentTypes.filter(ct => ct.schema.kind === 'collectionType');
    
    // Simple ordering - can be enhanced to detect circular dependencies
    const orderedTypes = [
      ...singleTypes,
      ...collectionTypes
    ];

    this.migrationOrder = orderedTypes.map(ct => ({
      uid: ct.uid,
      displayName: ct.schema.displayName,
      kind: ct.schema.kind,
      pluralName: ct.schema.info.pluralName,
      singularName: ct.schema.info.singularName,
      attributes: ct.schema.attributes
    }));

    console.log('📋 Migration order determined:');
    this.migrationOrder.forEach((ct, index) => {
      console.log(`  ${index + 1}. ${ct.displayName} (${ct.kind})`);
    });
  }

  async getContentEntries(contentType) {
    const entries = [];
    let page = 1;
    const pageSize = 100;

    const endpoint = contentType.kind === 'singleType' 
      ? `${this.source.url}/api/${contentType.singularName}`
      : `${this.source.url}/api/${contentType.pluralName}`;

    if (contentType.kind === 'singleType') {
      try {
        const response = await axios.get(endpoint, {
          headers: { Authorization: `Bearer ${this.sourceToken}` },
          params: {
            populate: 'deep'
          }
        });
        
        if (response.data.data) {
          return [response.data.data];
        }
        return [];
      } catch (error) {
        console.error(`Error fetching ${contentType.displayName}:`, error.response?.status);
        return [];
      }
    }

    // Collection type
    while (true) {
      try {
        const response = await axios.get(endpoint, {
          headers: { Authorization: `Bearer ${this.sourceToken}` },
          params: {
            'pagination[page]': page,
            'pagination[pageSize]': pageSize,
            populate: 'deep',
            'publicationState': 'preview' // Get both draft and published
          }
        });

        const pageEntries = response.data.data || [];
        if (pageEntries.length === 0) break;
        
        entries.push(...pageEntries);
        console.log(`📄 Fetched page ${page} of ${contentType.displayName}: ${pageEntries.length} entries`);
        
        if (pageEntries.length < pageSize) break;
        page++;
        
      } catch (error) {
        console.error(`Error fetching ${contentType.displayName}:`, error.response?.data || error.message);
        break;
      }
    }

    return entries;
  }

  processMediaReferences(data) {
    if (!data || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map(item => this.processMediaReferences(item));
    }

    const processed = { ...data };

    for (const [key, value] of Object.entries(processed)) {
      if (key === 'id' && typeof value === 'number') {
        // Don't modify the main ID
        continue;
      }

      if (value && typeof value === 'object') {
        if (value.id && (value.url || value.mime)) {
          // This looks like a media object
          const mappedId = this.mediaMapping.get(String(value.id));
          if (mappedId) {
            processed[key] = { id: parseInt(mappedId) };
          } else {
            console.warn(`⚠️  Media mapping not found for ID: ${value.id}`);
            processed[key] = null;
          }
        } else {
          // Recursively process nested objects
          processed[key] = this.processMediaReferences(value);
        }
      }
    }

    return processed;
  }

  removeSystemFields(data) {
    const cleaned = { ...data };
    delete cleaned.id;
    delete cleaned.documentId;
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    delete cleaned.publishedAt;
    delete cleaned.createdBy;
    delete cleaned.updatedBy;
    return cleaned;
  }

  async createEntry(contentType, entryData, isPublished = false) {
    const endpoint = contentType.kind === 'singleType'
      ? `${this.destination.url}/api/${contentType.singularName}`
      : `${this.destination.url}/api/${contentType.pluralName}`;

    try {
      // Clean and process the data
      let cleanData = this.removeSystemFields(entryData);
      cleanData = this.processMediaReferences(cleanData);

      const payload = { data: cleanData };

      const response = await axios.post(endpoint, payload, {
        headers: { 
          Authorization: `Bearer ${this.destinationToken}`,
          'Content-Type': 'application/json'
        }
      });

      const createdEntry = response.data.data;

      // If the original was published, publish the new entry
      if (isPublished && contentType.kind === 'collectionType') {
        try {
          await axios.post(`${endpoint}/${createdEntry.id}/actions/publish`, {}, {
            headers: { Authorization: `Bearer ${this.destinationToken}` }
          });
        } catch (publishError) {
          console.warn(`⚠️  Could not publish entry ${createdEntry.id}:`, publishError.response?.status);
        }
      }

      return createdEntry;
    } catch (error) {
      console.error(`❌ Failed to create entry:`, error.response?.data || error.message);
      throw error;
    }
  }

  async migrateContentType(contentType) {
    console.log(`\n🚀 Migrating ${contentType.displayName}...`);
    
    const entries = await this.getContentEntries(contentType);
    console.log(`📊 Found ${entries.length} entries to migrate`);

    const results = {
      total: entries.length,
      success: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`\n📝 Processing ${i + 1}/${entries.length}...`);

      try {
        const isPublished = !!entry.publishedAt;
        const createdEntry = await this.createEntry(contentType, entry, isPublished);
        
        // Map the IDs for relation updates
        this.contentMapping.set(`${contentType.uid}:${entry.id}`, createdEntry.id);
        
        console.log(`✅ Successfully migrated entry ${entry.id} -> ${createdEntry.id}`);
        results.success++;

      } catch (error) {
        console.error(`❌ Failed to migrate entry ${entry.id}:`, error.message);
        results.failed++;
        results.errors.push({
          contentType: contentType.uid,
          entryId: entry.id,
          error: error.message
        });
      }

      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`\n📊 ${contentType.displayName} Migration Results:`);
    console.log(`  ✅ Success: ${results.success}`);
    console.log(`  ❌ Failed: ${results.failed}`);

    return results;
  }

  async migrateAllContent() {
    console.log('🚀 Starting content migration...');
    
    const contentTypes = await this.getContentTypes();
    this.determineMigrationOrder(contentTypes);

    const migrationResults = {
      contentTypes: {},
      summary: {
        totalTypes: this.migrationOrder.length,
        totalEntries: 0,
        successfulEntries: 0,
        failedEntries: 0
      }
    };

    for (const contentType of this.migrationOrder) {
      try {
        const results = await this.migrateContentType(contentType);
        migrationResults.contentTypes[contentType.uid] = results;
        migrationResults.summary.totalEntries += results.total;
        migrationResults.summary.successfulEntries += results.success;
        migrationResults.summary.failedEntries += results.failed;
      } catch (error) {
        console.error(`❌ Failed to migrate content type ${contentType.uid}:`, error.message);
        migrationResults.contentTypes[contentType.uid] = {
          total: 0,
          success: 0,
          failed: 0,
          errors: [{ error: error.message }]
        };
      }
    }

    // Save migration results
    const resultsPath = path.join(__dirname, 'content-migration-results.json');
    const resultsData = {
      timestamp: new Date().toISOString(),
      contentMapping: Object.fromEntries(this.contentMapping),
      results: migrationResults
    };
    fs.writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));

    console.log('\n📊 CONTENT MIGRATION SUMMARY');
    console.log('=============================');
    console.log(`Content Types: ${migrationResults.summary.totalTypes}`);
    console.log(`Total Entries: ${migrationResults.summary.totalEntries}`);
    console.log(`✅ Successful: ${migrationResults.summary.successfulEntries}`);
    console.log(`❌ Failed: ${migrationResults.summary.failedEntries}`);
    console.log(`📁 Results saved to: ${resultsPath}`);

    return migrationResults;
  }
}

// Configuration
const config = {
  source: {
    url: process.env.SOURCE_STRAPI_URL || 'https://your-cloud-strapi.com',
    username: process.env.SOURCE_USERNAME || 'admin@example.com',
    password: process.env.SOURCE_PASSWORD || 'password'
  },
  destination: {
    url: process.env.DEST_STRAPI_URL || 'http://localhost:1337',
    username: process.env.DEST_USERNAME || 'admin@example.com',
    password: process.env.DEST_PASSWORD || 'password'
  }
};

// Main execution
async function main() {
  const migrator = new ContentMigrator(config.source, config.destination);
  
  try {
    await migrator.authenticate();
    migrator.loadMediaMapping();
    await migrator.migrateAllContent();
    console.log('\n✅ Content migration completed!');
  } catch (error) {
    console.error('❌ Content migration failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ContentMigrator;
