#!/usr/bin/env node

/**
 * Configuration Test - Check if migration setup is ready
 */

const config = require('./migration-config');

console.log('🔧 Migration Configuration Test');
console.log('===============================\n');

console.log('Source Configuration:');
console.log(`  URL: ${config.source.url}`);
console.log(`  API Token: ${config.source.apiToken ? '***SET***' : 'NOT SET'}`);
console.log(`  Username: ${config.source.username || 'NOT SET'}`);
console.log(`  Password: ${config.source.password ? '***' : 'NOT SET'}\n`);

console.log('Destination Configuration:');
console.log(`  URL: ${config.destination.url}`);
console.log(`  API Token: ${config.destination.apiToken ? '***SET***' : 'NOT SET'}`);
console.log(`  Username: ${config.destination.username || 'NOT SET'}`);
console.log(`  Password: ${config.destination.password ? '***' : 'NOT SET'}\n`);

// Check if placeholders are still present or if we have proper authentication
const hasPlaceholders = 
  config.source.url.includes('your-cloud-strapi.com') ||
  config.destination.url.includes('your-heroku-app.herokuapp.com');

const hasAuthentication = 
  (config.source.apiToken || (config.source.username && config.source.password)) &&
  (config.destination.apiToken || (config.destination.username && config.destination.password));

if (hasPlaceholders) {
  console.log('❌ Configuration contains placeholder URLs!');
  console.log('\nTo configure the migration, update your .env file with:');
  console.log('SOURCE_STRAPI_URL=https://your-actual-cloud-strapi-url.com');
  console.log('DEST_STRAPI_URL=https://your-actual-heroku-app.herokuapp.com');
} else if (!hasAuthentication) {
  console.log('❌ Missing authentication credentials!');
  console.log('\nAdd either API tokens or username/password to your .env file:');
  console.log('SOURCE_API_TOKEN=your-source-api-token');
  console.log('DEST_API_TOKEN=your-destination-api-token');
  console.log('# OR');
  console.log('SOURCE_USERNAME=your-source-email@domain.com');
  console.log('SOURCE_PASSWORD=your-source-password');
  console.log('DEST_USERNAME=your-dest-email@domain.com');
  console.log('DEST_PASSWORD=your-dest-password');
} else {
  console.log('✅ Configuration looks good!');
  console.log('\nAuthentication method:');
  if (config.source.apiToken && config.destination.apiToken) {
    console.log('- Using API tokens (recommended)');
  } else {
    console.log('- Using username/password');
  }
  console.log('\nReady to run migration. Available commands:');
  console.log('- npm run migrate:analyze    (analyze schemas only)');
  console.log('- npm run migrate           (full migration)');
  console.log('- npm run migrate:help      (show all options)');
}

console.log('\n📋 Content Types to Migrate:');
config.options.contentTypeOrder.forEach((type, index) => {
  console.log(`  ${index + 1}. ${type}`);
});

console.log('\n🔧 Migration Options:');
console.log(`  Max Retries: ${config.options.maxRetries}`);
console.log(`  Batch Size: ${config.options.batchSize}`);
console.log(`  Temp Directory: ${config.options.tempDir}`);
