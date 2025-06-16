/**
 * Schema Inspector - Analyze source and destination Strapi schemas
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class SchemaInspector {
  constructor(sourceConfig, destinationConfig) {
    this.source = sourceConfig;
    this.destination = destinationConfig;
    this.sourceToken = null;
    this.destinationToken = null;
  }

  async authenticate() {
    console.log('🔐 Authenticating with both Strapi instances...');
    
    // Check if we have API tokens or need to use username/password
    if (this.source.apiToken) {
      this.sourceToken = this.source.apiToken;
      console.log('✅ Source authentication using API token');
    } else {
      // Authenticate with source using username/password
      try {
        const sourceAuth = await axios.post(`${this.source.url}/api/auth/local`, {
          identifier: this.source.username,
          password: this.source.password
        });
        this.sourceToken = sourceAuth.data.jwt;
        console.log('✅ Source authentication successful');
      } catch (error) {
        console.error('❌ Source authentication failed:', error.response?.data || error.message);
        throw error;
      }
    }

    if (this.destination.apiToken) {
      this.destinationToken = this.destination.apiToken;
      console.log('✅ Destination authentication using API token');
    } else {
      // Authenticate with destination using username/password
      try {
        const destAuth = await axios.post(`${this.destination.url}/api/auth/local`, {
          identifier: this.destination.username,
          password: this.destination.password
        });
        this.destinationToken = destAuth.data.jwt;
        console.log('✅ Destination authentication successful');
      } catch (error) {
        console.error('❌ Destination authentication failed:', error.response?.data || error.message);
        throw error;
      }
    }
  }

  async getContentTypes(url, token) {
    try {
      const response = await axios.get(`${url}/api/content-type-builder/content-types`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching content types:', error.response?.data || error.message);
      return [];
    }
  }

  async analyzeSchemas() {
    console.log('🔍 Analyzing schemas...');
    
    const sourceContentTypes = await this.getContentTypes(this.source.url, this.sourceToken);
    const destContentTypes = await this.getContentTypes(this.destination.url, this.destinationToken);

    const analysis = {
      source: {
        url: this.source.url,
        contentTypes: sourceContentTypes.length,
        types: sourceContentTypes.map(ct => ({
          uid: ct.uid,
          displayName: ct.schema.displayName,
          kind: ct.schema.kind,
          attributes: Object.keys(ct.schema.attributes || {}).length
        }))
      },
      destination: {
        url: this.destination.url,
        contentTypes: destContentTypes.length,
        types: destContentTypes.map(ct => ({
          uid: ct.uid,
          displayName: ct.schema.displayName,
          kind: ct.schema.kind,
          attributes: Object.keys(ct.schema.attributes || {}).length
        }))
      },
      comparison: {
        missingInDestination: [],
        onlyInDestination: [],
        common: []
      }
    };

    // Compare schemas
    const sourceUids = sourceContentTypes.map(ct => ct.uid);
    const destUids = destContentTypes.map(ct => ct.uid);

    analysis.comparison.missingInDestination = sourceUids.filter(uid => !destUids.includes(uid));
    analysis.comparison.onlyInDestination = destUids.filter(uid => !sourceUids.includes(uid));
    analysis.comparison.common = sourceUids.filter(uid => destUids.includes(uid));

    // Save analysis
    const outputPath = path.join(__dirname, 'schema-analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
    console.log(`📊 Schema analysis saved to: ${outputPath}`);

    return analysis;
  }

  async getContentCounts() {
    console.log('📊 Getting content counts...');
    
    const sourceContentTypes = await this.getContentTypes(this.source.url, this.sourceToken);
    const counts = {};

    for (const contentType of sourceContentTypes) {
      if (contentType.schema.kind === 'collectionType') {
        try {
          const response = await axios.get(`${this.source.url}/api/${contentType.schema.info.pluralName}?pagination[pageSize]=1`, {
            headers: { Authorization: `Bearer ${this.sourceToken}` }
          });
          counts[contentType.uid] = response.data.meta?.pagination?.total || 0;
        } catch (error) {
          console.warn(`⚠️  Could not get count for ${contentType.uid}:`, error.response?.status);
          counts[contentType.uid] = 'Error';
        }
      } else if (contentType.schema.kind === 'singleType') {
        try {
          const response = await axios.get(`${this.source.url}/api/${contentType.schema.info.singularName}`, {
            headers: { Authorization: `Bearer ${this.sourceToken}` }
          });
          counts[contentType.uid] = response.data.data ? 1 : 0;
        } catch (error) {
          console.warn(`⚠️  Could not get count for ${contentType.uid}:`, error.response?.status);
          counts[contentType.uid] = 'Error';
        }
      }
    }

    const countsPath = path.join(__dirname, 'content-counts.json');
    fs.writeFileSync(countsPath, JSON.stringify(counts, null, 2));
    console.log(`📊 Content counts saved to: ${countsPath}`);

    return counts;
  }

  printSummary(analysis, counts) {
    console.log('\n📋 MIGRATION SUMMARY');
    console.log('====================');
    console.log(`Source: ${analysis.source.url}`);
    console.log(`Destination: ${analysis.destination.url}`);
    console.log(`\nContent Types:`);
    console.log(`  Source: ${analysis.source.contentTypes}`);
    console.log(`  Destination: ${analysis.destination.contentTypes}`);
    console.log(`  Common: ${analysis.comparison.common.length}`);
    console.log(`  Missing in destination: ${analysis.comparison.missingInDestination.length}`);
    
    if (analysis.comparison.missingInDestination.length > 0) {
      console.log(`\n⚠️  Missing Content Types in Destination:`);
      analysis.comparison.missingInDestination.forEach(uid => {
        console.log(`    - ${uid}`);
      });
    }

    console.log(`\n📊 Content Counts:`);
    Object.entries(counts).forEach(([uid, count]) => {
      console.log(`  ${uid}: ${count}`);
    });
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
  try {
    const inspector = new SchemaInspector(config.source, config.destination);
    await inspector.authenticate();
    
    const analysis = await inspector.analyzeSchemas();
    const counts = await inspector.getContentCounts();
    
    inspector.printSummary(analysis, counts);
    
    console.log('\n✅ Schema inspection completed!');
    console.log('📁 Check the generated JSON files for detailed analysis.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SchemaInspector;
