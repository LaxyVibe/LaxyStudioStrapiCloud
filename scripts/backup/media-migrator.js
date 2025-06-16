/**
 * Media Migrator - Download and upload media files between Strapi instances
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class MediaMigrator {
  constructor(sourceConfig, destinationConfig) {
    this.source = sourceConfig;
    this.destination = destinationConfig;
    this.sourceToken = null;
    this.destinationToken = null;
    this.mediaMap = new Map(); // Map source media ID to destination media ID
  }

  async authenticate() {
    console.log('🔐 Authenticating for media migration...');
    
    // Check if we have API tokens or need to use username/password
    if (this.source.apiToken) {
      this.sourceToken = this.source.apiToken;
      console.log('✅ Source media authentication using API token');
    } else {
      // Authenticate with source using username/password
      const sourceAuth = await axios.post(`${this.source.url}/api/auth/local`, {
        identifier: this.source.username,
        password: this.source.password
      });
      this.sourceToken = sourceAuth.data.jwt;
      console.log('✅ Source media authentication successful');
    }

    if (this.destination.apiToken) {
      this.destinationToken = this.destination.apiToken;
      console.log('✅ Destination media authentication using API token');
    } else {
      // Authenticate with destination using username/password
      const destAuth = await axios.post(`${this.destination.url}/api/auth/local`, {
        identifier: this.destination.username,
        password: this.destination.password
      });
      this.destinationToken = destAuth.data.jwt;
      console.log('✅ Destination media authentication successful');
    }
  }

  async getSourceMedia() {
    console.log('📥 Fetching source media files...');
    
    let allMedia = [];
    let page = 1;
    const pageSize = 100;
    
    while (true) {
      try {
        const response = await axios.get(`${this.source.url}/api/upload/files`, {
          headers: { Authorization: `Bearer ${this.sourceToken}` },
          params: {
            'pagination[page]': page,
            'pagination[pageSize]': pageSize
          }
        });

        const media = response.data.data || response.data;
        if (!Array.isArray(media) || media.length === 0) break;
        
        allMedia = allMedia.concat(media);
        
        console.log(`📄 Fetched page ${page}, total files: ${allMedia.length}`);
        
        if (media.length < pageSize) break;
        page++;
        
      } catch (error) {
        console.error('Error fetching media:', error.response?.data || error.message);
        break;
      }
    }

    console.log(`📊 Total media files found: ${allMedia.length}`);
    return allMedia;
  }

  async downloadFile(fileUrl, fileName) {
    try {
      const response = await axios.get(fileUrl, {
        responseType: 'stream',
        timeout: 30000
      });

      const tempPath = path.join(__dirname, 'temp', fileName);
      
      // Ensure temp directory exists
      const tempDir = path.dirname(tempPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const writer = fs.createWriteStream(tempPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(tempPath));
        writer.on('error', reject);
      });
    } catch (error) {
      console.error(`Failed to download ${fileUrl}:`, error.message);
      throw error;
    }
  }

  async uploadFile(filePath, mediaData) {
    try {
      const form = new FormData();
      form.append('files', fs.createReadStream(filePath));
      
      // Add metadata
      const fileInfo = {
        name: mediaData.name,
        alternativeText: mediaData.alternativeText || '',
        caption: mediaData.caption || ''
      };
      form.append('fileInfo', JSON.stringify(fileInfo));

      const response = await axios.post(`${this.destination.url}/api/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${this.destinationToken}`
        },
        timeout: 60000
      });

      return response.data[0]; // Return the uploaded file data
    } catch (error) {
      console.error(`Failed to upload ${filePath}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async migrateMedia() {
    console.log('🚀 Starting media migration...');
    
    const sourceMedia = await this.getSourceMedia();
    const migrationResults = {
      total: sourceMedia.length,
      success: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < sourceMedia.length; i++) {
      const media = sourceMedia[i];
      console.log(`\n📁 Processing ${i + 1}/${sourceMedia.length}: ${media.name}`);

      try {
        // Check if file already exists in destination
        const existingFile = await this.findExistingFile(media);
        if (existingFile) {
          console.log('✅ File already exists, mapping...');
          this.mediaMap.set(media.id, existingFile.id);
          migrationResults.success++;
          continue;
        }

        // Build the full URL for the file
        let fileUrl = media.url;
        if (fileUrl.startsWith('/')) {
          fileUrl = `${this.source.url}${fileUrl}`;
        }

        // Download file
        console.log(`⬇️  Downloading: ${fileUrl}`);
        const localPath = await this.downloadFile(fileUrl, media.name);

        // Upload to destination
        console.log(`⬆️  Uploading to destination...`);
        const uploadedFile = await this.uploadFile(localPath, media);

        // Map the IDs
        this.mediaMap.set(media.id, uploadedFile.id);

        // Clean up temp file
        fs.unlinkSync(localPath);

        console.log(`✅ Successfully migrated: ${media.name}`);
        migrationResults.success++;

      } catch (error) {
        console.error(`❌ Failed to migrate ${media.name}:`, error.message);
        migrationResults.failed++;
        migrationResults.errors.push({
          fileName: media.name,
          error: error.message
        });
      }

      // Small delay to avoid overwhelming the servers
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Save media mapping for later use
    const mappingPath = path.join(__dirname, 'media-mapping.json');
    const mappingData = {
      timestamp: new Date().toISOString(),
      mapping: Object.fromEntries(this.mediaMap),
      results: migrationResults
    };
    fs.writeFileSync(mappingPath, JSON.stringify(mappingData, null, 2));

    console.log('\n📊 MEDIA MIGRATION SUMMARY');
    console.log('==========================');
    console.log(`Total files: ${migrationResults.total}`);
    console.log(`✅ Success: ${migrationResults.success}`);
    console.log(`❌ Failed: ${migrationResults.failed}`);
    console.log(`📁 Media mapping saved to: ${mappingPath}`);

    if (migrationResults.errors.length > 0) {
      console.log('\n❌ Failed files:');
      migrationResults.errors.forEach(error => {
        console.log(`  - ${error.fileName}: ${error.error}`);
      });
    }

    return this.mediaMap;
  }

  async findExistingFile(sourceMedia) {
    try {
      // Try to find by name first
      const response = await axios.get(`${this.destination.url}/api/upload/files`, {
        headers: { Authorization: `Bearer ${this.destinationToken}` },
        params: {
          'filters[name][$eq]': sourceMedia.name
        }
      });

      const files = response.data.data || response.data;
      if (files.length > 0) {
        // Check if size matches (if available)
        const match = files.find(file => 
          file.name === sourceMedia.name && 
          (file.size === sourceMedia.size || !sourceMedia.size)
        );
        return match || files[0];
      }
    } catch (error) {
      // File doesn't exist, which is fine
    }
    return null;
  }

  // Clean up temp directory
  cleanup() {
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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
  const migrator = new MediaMigrator(config.source, config.destination);
  
  try {
    await migrator.authenticate();
    await migrator.migrateMedia();
    console.log('\n✅ Media migration completed!');
  } catch (error) {
    console.error('❌ Media migration failed:', error.message);
    process.exit(1);
  } finally {
    migrator.cleanup();
  }
}

if (require.main === module) {
  main();
}

module.exports = MediaMigrator;
