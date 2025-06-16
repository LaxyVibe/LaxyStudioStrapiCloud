/**
 * Migration Configuration
 * 
 * Replace the placeholder values with your actual Strapi instance URLs and credentials
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const config = {
  source: {
    url: process.env.SOURCE_STRAPI_URL || 'https://ethical-novelty-0c204c906b.strapiapp.com',
    apiToken: process.env.SOURCE_API_TOKEN,
    // Fallback to username/password if no API token
    username: process.env.SOURCE_USERNAME,
    password: process.env.SOURCE_PASSWORD
  },
  destination: {
    url: process.env.DEST_STRAPI_URL || 'https://laxy-studio-strapi-c1d6d20cbc41.herokuapp.com',
    apiToken: process.env.DEST_API_TOKEN,
    // Fallback to username/password if no API token
    username: process.env.DEST_USERNAME,
    password: process.env.DEST_PASSWORD
  },
  options: {
    // Migration options
    maxRetries: 3,
    retryDelay: 1000,
    batchSize: 10,
    tempDir: './temp',
    
    // Content type processing order (dependencies first)
    contentTypeOrder: [
      'api::tag-label.tag-label',      // Independent - no dependencies
      'api::stay.stay',                // Independent - no dependencies
      'api::poi.poi',                  // Depends on tag-label (tag_labels relation)
      'api::suite.suite',              // Depends on stay (ownedBy relation)
      'api::poi-recommendation.poi-recommendation', // Depends on poi and stay (poi, recommendedBy relations)
      'api::hub-application-config.hub-application-config' // Single type - Step 4 handles components
    ],
    
    // Media handling
    mediaTypes: ['images', 'files', 'videos', 'audios'],
    
    // Skip these content types if needed
    skipContentTypes: [
      // Add any content types you want to skip
    ]
  }
};

module.exports = config;
