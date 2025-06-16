const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const config = require('./migration-config');

class MediaMigrator {
  constructor() {
    this.sourceAxios = axios.create({
      baseURL: config.source.url,
      headers: { Authorization: `Bearer ${config.source.apiToken}` }
    });
    
    this.destAxios = axios.create({
      baseURL: config.destination.url,
      headers: { Authorization: `Bearer ${config.destination.apiToken}` }
    });
    
    this.mediaMappings = {};
  }

  async fetchSourceMedia() {
    console.log('📥 Fetching source media files...');
    try {
      const response = await this.sourceAxios.get('/api/upload/files?pagination[limit]=-1');
      console.log(`Found ${response.data.length} media files in source`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching source media:', error.response?.data || error.message);
      throw error;
    }
  }

  async downloadFile(url) {
    try {
      const response = await axios.get(url, { responseType: 'stream' });
      return response.data;
    } catch (error) {
      console.error(`❌ Error downloading file ${url}:`, error.message);
      throw error;
    }
  }

  async uploadToDestination(fileStream, fileName, mimeType) {
    try {
      const form = new FormData();
      form.append('files', fileStream, fileName);

      const response = await this.destAxios.post('/api/upload', form, {
        headers: {
          ...form.getHeaders(),
        },
      });

      return response.data[0];
    } catch (error) {
      console.error(`❌ Error uploading ${fileName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async migrateMedia() {
    try {
      const sourceMedia = await this.fetchSourceMedia();
      console.log(`\n🚀 Starting migration of ${sourceMedia.length} media files...\n`);

      let successCount = 0;
      let failCount = 0;

      for (const [index, media] of sourceMedia.entries()) {
        try {
          console.log(`[${index + 1}/${sourceMedia.length}] Migrating: ${media.name}`);
          
          // Download from source
          const fileStream = await this.downloadFile(media.url);
          
          // Upload to destination
          const newMedia = await this.uploadToDestination(
            fileStream, 
            media.name, 
            media.mime
          );

          // Store mapping
          this.mediaMappings[media.id] = newMedia.id;
          
          console.log(`✅ Successfully migrated: ${media.name} (${media.id} -> ${newMedia.id})`);
          successCount++;
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`❌ Failed to migrate ${media.name}:`, error.message);
          failCount++;
        }
      }

      // Save mappings to file
      const mappingsPath = path.join(__dirname, 'mediaMappings.json');
      fs.writeFileSync(mappingsPath, JSON.stringify(this.mediaMappings, null, 2));

      console.log(`\n📊 Media Migration Summary:`);
      console.log(`✅ Successful: ${successCount}`);
      console.log(`❌ Failed: ${failCount}`);
      console.log(`📄 Mappings saved to: ${mappingsPath}`);

      return this.mediaMappings;
      
    } catch (error) {
      console.error('❌ Media migration failed:', error);
      throw error;
    }
  }
}

// Run media migration if called directly
if (require.main === module) {
  const migrator = new MediaMigrator();
  migrator.migrateMedia()
    .then(() => {
      console.log('🎉 Media migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Media migration failed:', error);
      process.exit(1);
    });
}

module.exports = MediaMigrator;
