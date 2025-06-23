#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const http = require('http');
const readline = require('readline');

// Default Configuration
// const DEFAULT_BASE_URL = 'http://localhost:1337';
// const DEFAULT_BEARER_TOKEN = '488843908d8140319449ff1c377c8b706771e506932d54375f00c635b35578bff38c518cbb92840f7972cd7f6ad0ea4d244625a3f903d4e5cc705fd92dc89fcbfa249c0a4e136bb81d55d97513a67b0fcc721188cb5dae517aa09c74acfe6ab22d21ae1bbb8d1645e6710057ba5da64d8ba0c0623cabc98d650c4b2edc37a6d9';

const DEFAULT_BASE_URL = 'https://laxy-studio-strapi-c1d6d20cbc41.herokuapp.com';
const DEFAULT_BEARER_TOKEN = 'd650dbf3c74ce5de63b9a4e677b5d7fa9080b6e1e9e50e80656dad9cdc14b765d6937cc53848312f890bace225f95197580ff4a3430e551caf2ec96648f398869d1c98c2344320125c0702981a4b9862c62e54c1f9d2d73ebce0678daa06ba971fc47e978ae74a61ff69fd648edc679c76087bb6e5c5210eee97071fe29a01b2';

// Runtime Configuration (will be set during execution)
let BASE_URL = DEFAULT_BASE_URL;
let BEARER_TOKEN = DEFAULT_BEARER_TOKEN;

// Supported locales
const SUPPORTED_LOCALES = {
  'en': 'English',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh-Hans': 'Chinese (Simplified)',
  'zh-Hant': 'Chinese (Traditional)'
};

// API endpoint template with all fields and populations
const API_ENDPOINT_TEMPLATE = `/api/suites/{documentId}?fields[0]=name&fields[1]=label&fields[2]=headline&fields[3]=address&fields[4]=addressURL&fields[5]=checkInOut&fields[6]=amenities&fields[7]=houseRules&fields[8]=addressEmbedHTML&populate[slider][fields][0]=url&populate[faq][fields][0]=question&populate[faq][fields][1]=answer&populate[wifi][fields][0]=network&populate[wifi][fields][1]=password&populate[ownedBy][fields][0]=slug&populate[ownedBy][fields][1]=label&populate[ownedBy][fields][2]=greeting&populate[ownedBy][fields][3]=nativeLanguageCode&populate[ownedBy][populate][avatar][fields][0]=url&populate[ownedBy][populate][pickedPOIs][fields][0]=slug&populate[ownedBy][populate][pickedPOIs][fields][1]=label&populate[ownedBy][populate][pickedPOIs][fields][2]=address&populate[ownedBy][populate][pickedPOIs][fields][3]=highlight&populate[ownedBy][populate][pickedPOIs][fields][4]=externalURL&populate[ownedBy][populate][pickedPOIs][fields][5]=type&populate[ownedBy][populate][pickedPOIs][populate][tag_labels][fields][0]=name&populate[ownedBy][populate][pickedPOIs][populate][tag_labels][fields][1]=color&populate[ownedBy][populate][pickedPOIs][populate][coverPhoto][fields][0]=url&locale={locale}`;

/**
 * Make HTTP request
 */
function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'Content-Type': 'application/json',
      }
    };

    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${response.error?.message || body}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Fetch all suites list
 */
async function fetchSuitesList() {
  console.log('🔍 Fetching suites list...');
  
  const url = `${BASE_URL}/api/suites`;
  
  try {
    const response = await makeRequest(url);
    console.log(`✅ Successfully fetched ${response.data.length} suites`);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch suites list:', error.message);
    throw error;
  }
}

/**
 * Fetch suite data from source
 */
async function fetchSourceSuite(sourceDocumentId, locale = 'en') {
  console.log(`🔍 Fetching source suite data for documentId: ${sourceDocumentId} (locale: ${locale})`);
  
  const url = BASE_URL + API_ENDPOINT_TEMPLATE
    .replace('{documentId}', sourceDocumentId)
    .replace('{locale}', locale);
  
  try {
    const response = await makeRequest(url);
    console.log('✅ Successfully fetched source suite data');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch source suite:', error.message);
    throw error;
  }
}

/**
 * Prepare data for update (remove read-only fields and IDs)
 */
function prepareDataForUpdate(sourceData) {
  console.log('🔧 Preparing data for update...');
  
  // Debug: Log the source data structure
  console.log('📊 Source data keys:', Object.keys(sourceData));
  console.log('📋 FAQ data:', sourceData.faq);
  console.log('📋 WiFi data:', sourceData.wifi);
  console.log('📋 CheckInOut:', sourceData.checkInOut);
  console.log('📋 Amenities:', sourceData.amenities);
  console.log('📋 House Rules:', sourceData.houseRules);
  
  const updateData = {
    data: {
      // Basic fields - only include if they exist and are not null/undefined
      ...(sourceData.name !== undefined && sourceData.name !== null && { name: sourceData.name }),
      ...(sourceData.label !== undefined && sourceData.label !== null && { label: sourceData.label }),
      ...(sourceData.headline !== undefined && sourceData.headline !== null && { headline: sourceData.headline }),
      ...(sourceData.address !== undefined && sourceData.address !== null && { address: sourceData.address }),
      ...(sourceData.addressURL !== undefined && sourceData.addressURL !== null && { addressURL: sourceData.addressURL }),
      ...(sourceData.addressEmbedHTML !== undefined && sourceData.addressEmbedHTML !== null && { addressEmbedHTML: sourceData.addressEmbedHTML }),
      
      // Rich text fields (TinyMCE) - handle them properly, even if null/empty
      // These fields need to be created in the destination locale
      checkInOut: sourceData.checkInOut || null,
      amenities: sourceData.amenities || null,
      houseRules: sourceData.houseRules || null,
    }
  };

  // Handle slider (media) - only if exists and has items
  if (sourceData.slider && Array.isArray(sourceData.slider) && sourceData.slider.length > 0) {
    const sliderIds = sourceData.slider.map(item => item.id).filter(Boolean);
    if (sliderIds.length > 0) {
      updateData.data.slider = sliderIds;
      console.log('📸 Slider IDs:', sliderIds);
    }
  }

  // Handle FAQ components - ensure proper structure, always include even if empty
  // This creates the localized FAQ entries
  if (sourceData.faq && Array.isArray(sourceData.faq)) {
    const faqItems = sourceData.faq
      .filter(item => item && (item.question || item.answer)) // Filter out completely empty items
      .map(item => ({
        question: item.question || '',
        answer: item.answer || ''
      }));
    
    updateData.data.faq = faqItems;
    console.log('❓ FAQ items:', faqItems.length);
  } else {
    // Set empty array to ensure the field exists in the destination locale
    updateData.data.faq = [];
    console.log('❓ FAQ items: 0 (creating empty array)');
  }

  // Handle WiFi components - ensure proper structure
  if (sourceData.wifi && Array.isArray(sourceData.wifi) && sourceData.wifi.length > 0) {
    const wifiItems = sourceData.wifi
      .filter(item => item && (item.network || item.password)) // Filter out empty items
      .map(item => ({
        network: item.network || '',
        password: item.password || ''
      }));
    
    if (wifiItems.length > 0) {
      updateData.data.wifi = wifiItems;
      console.log('📶 WiFi items:', wifiItems.length);
    }
  }

  // Handle ownedBy relation - only if exists
  if (sourceData.ownedBy && sourceData.ownedBy.id) {
    updateData.data.ownedBy = sourceData.ownedBy.id;
    console.log('🏠 OwnedBy ID:', sourceData.ownedBy.id);
  }

  console.log('✅ Data prepared for update');
  console.log('📦 Update payload keys:', Object.keys(updateData.data));
  
  return updateData;
}

/**
 * Update destination suite
 */
async function updateDestinationSuite(destinationDocumentId, updateData, locale = 'en') {
  console.log(`🔄 Updating destination suite documentId: ${destinationDocumentId} (locale: ${locale})`);
  
  const url = `${BASE_URL}/api/suites/${destinationDocumentId}?locale=${locale}`;
  
  // Debug: Log the payload being sent
  console.log('📤 Update payload:', JSON.stringify(updateData, null, 2));
  
  try {
    const response = await makeRequest(url, 'PUT', updateData);
    console.log('✅ Successfully updated destination suite');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to update destination suite:', error.message);
    console.error('📤 Payload that failed:', JSON.stringify(updateData, null, 2));
    throw error;
  }
}

/**
 * Main sync function
 */
async function syncSuite(sourceDocumentId, destinationDocumentId, locale = 'en') {
  try {
    console.log('🚀 Starting suite synchronization...');
    console.log(`📋 Source: ${sourceDocumentId}`);
    console.log(`🎯 Destination: ${destinationDocumentId}`);
    console.log(`🌐 Locale: ${locale}`);
    console.log('─'.repeat(50));
    
    // Step 1: Fetch source data
    const sourceData = await fetchSourceSuite(sourceDocumentId, locale);
    
    // Step 2: Prepare data for update
    const updateData = prepareDataForUpdate(sourceData);
    
    // Step 3: Update destination
    const updatedData = await updateDestinationSuite(destinationDocumentId, updateData, locale);
    
    console.log('─'.repeat(50));
    console.log('🎉 Suite synchronization completed successfully!');
    console.log(`✨ Updated suite: ${updatedData.label || updatedData.name || destinationDocumentId}`);
    
    // Log summary
    const summary = {
      sourceId: sourceDocumentId,
      destinationId: destinationDocumentId,
      locale: locale,
      updatedFields: Object.keys(updateData.data),
      timestamp: new Date().toISOString()
    };
    
    console.log('\n📊 Sync Summary:');
    console.log(JSON.stringify(summary, null, 2));
    
  } catch (error) {
    console.error('\n💥 Synchronization failed:');
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Validate document ID format
 */
function validateDocumentId(documentId) {
  if (!documentId || typeof documentId !== 'string' || documentId.trim().length === 0) {
    return false;
  }
  return true;
}

/**
 * Create readline interface for interactive input
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask user for input with validation
 */
function askQuestion(rl, question, validator = null) {
  return new Promise((resolve) => {
    const ask = () => {
      rl.question(question, (answer) => {
        if (validator) {
          const validation = validator(answer.trim());
          if (validation.valid) {
            resolve(answer.trim());
          } else {
            console.log(`❌ ${validation.message}`);
            ask();
          }
        } else {
          resolve(answer.trim());
        }
      });
    };
    ask();
  });
}

/**
 * Display locale selection menu and get user choice
 */
async function selectLocale(rl) {
  console.log('\n🌐 Select locale:');
  const locales = Object.keys(SUPPORTED_LOCALES);
  locales.forEach((locale, index) => {
    console.log(`  ${index + 1}. ${locale} (${SUPPORTED_LOCALES[locale]})`);
  });
  
  const choice = await askQuestion(
    rl,
    `\nEnter your choice (1-${locales.length}) [default: 1 for English]: `,
    (input) => {
      if (input === '') return { valid: true }; // Default to 1
      const num = parseInt(input);
      if (isNaN(num) || num < 1 || num > locales.length) {
        return { valid: false, message: `Please enter a number between 1 and ${locales.length}` };
      }
      return { valid: true };
    }
  );
  
  const selectedIndex = choice === '' ? 0 : parseInt(choice) - 1;
  return locales[selectedIndex];
}

/**
 * Configure API settings (URL and Bearer Token)
 */
async function configureApiSettings(rl) {
  console.log('\n⚙️  API Configuration');
  console.log('─'.repeat(30));
  
  // Ask for Base URL
  const baseUrl = await askQuestion(
    rl,
    `🌐 Enter Strapi Base URL [default: ${DEFAULT_BASE_URL}]: `,
    (input) => {
      if (input === '') return { valid: true }; // Use default
      try {
        new URL(input); // Validate URL format
        return { valid: true };
      } catch {
        return { valid: false, message: 'Please enter a valid URL (e.g., http://localhost:1337)' };
      }
    }
  );
  
  // Ask for Bearer Token
  const bearerToken = await askQuestion(
    rl,
    `🔑 Enter Bearer Token [default: use existing token]: `,
    (input) => {
      if (input === '') return { valid: true }; // Use default
      if (input.length < 10) {
        return { valid: false, message: 'Bearer token seems too short. Please enter a valid token.' };
      }
      return { valid: true };
    }
  );
  
  // Set the global configuration
  BASE_URL = baseUrl || DEFAULT_BASE_URL;
  BEARER_TOKEN = bearerToken || DEFAULT_BEARER_TOKEN;
  
  console.log(`✅ API Base URL set to: ${BASE_URL}`);
  console.log(`✅ Bearer Token configured: ${BEARER_TOKEN.substring(0, 20)}...`);
}

/**
 * Display suite selection menu and get user choice
 */
async function selectSuite(rl, suites, title, excludeDocumentId = null) {
  console.log(`\n${title}`);
  console.log('─'.repeat(50));
  
  // Filter out excluded suite if provided
  const availableSuites = excludeDocumentId 
    ? suites.filter(suite => suite.documentId !== excludeDocumentId)
    : suites;
  
  if (availableSuites.length === 0) {
    throw new Error('No available suites to select from');
  }
  
  availableSuites.forEach((suite, index) => {
    const displayName = suite.name || 'Unnamed Suite';
    console.log(`  ${index + 1}. ${displayName} - ${suite.documentId}`);
  });
  
  const choice = await askQuestion(
    rl,
    `\nEnter your choice (1-${availableSuites.length}): `,
    (input) => {
      const num = parseInt(input);
      if (isNaN(num) || num < 1 || num > availableSuites.length) {
        return { valid: false, message: `Please enter a number between 1 and ${availableSuites.length}` };
      }
      return { valid: true };
    }
  );
  
  const selectedIndex = parseInt(choice) - 1;
  return availableSuites[selectedIndex];
}

/**
 * Interactive wizard to collect user input
 */
async function runWizard() {
  const rl = createInterface();
  
  console.log('🧙‍♂️ Suite Sync Wizard');
  console.log('═'.repeat(50));
  console.log('This wizard will help you sync suite content between two suites.');
  console.log('');
  
  try {
    // First, configure API settings
    await configureApiSettings(rl);
    
    // Then fetch the suites list
    const suites = await fetchSuitesList();
    
    if (suites.length === 0) {
      console.error('❌ No suites found in the system');
      rl.close();
      process.exit(1);
    }
    
    // Get source suite
    const sourceSuite = await selectSuite(rl, suites, '📋 Select source suite:');
    
    // Get destination suite (exclude the source)
    const destinationSuite = await selectSuite(
      rl, 
      suites, 
      '🎯 Select destination suite:', 
      sourceSuite.documentId
    );
    
    // Get locale
    const locale = await selectLocale(rl);
    
    // Show locale creation warning
    console.log('\n⚠️  IMPORTANT PREREQUISITE');
    console.log('═'.repeat(50));
    console.log('🚨 DANGER: Before proceeding, you MUST manually create the');
    console.log(`   ${locale} (${SUPPORTED_LOCALES[locale]}) locale entry for the destination suite:`);
    console.log(`   ${destinationSuite.name || 'Unnamed'} - ${destinationSuite.documentId}`);
    console.log('');
    console.log('📝 Steps to create locale entry:');
    console.log('   1. Go to Strapi Admin Panel');
    console.log('   2. Navigate to Content Manager > Suites');
    console.log(`   3. Open destination suite: ${destinationSuite.name || 'Unnamed'}`);
    console.log(`   4. Switch to "${locale}" locale using the locale selector`);
    console.log('   5. Save the entry (even if empty) to create the locale');
    console.log('');
    console.log('❌ If you skip this step, the synchronization will CRASH!');
    console.log('═'.repeat(50));
    
    const localeConfirm = await askQuestion(
      rl,
      `\n✅ I have manually created the ${locale} locale entry for the destination suite (y/N): `,
      (input) => {
        const normalized = input.toLowerCase();
        if (normalized !== 'y' && normalized !== 'yes' && normalized !== 'n' && normalized !== 'no' && normalized !== '') {
          return { valid: false, message: 'Please enter y/yes or n/no' };
        }
        return { valid: true };
      }
    );
    
    if (localeConfirm.toLowerCase() !== 'y' && localeConfirm.toLowerCase() !== 'yes') {
      console.log('❌ Please create the locale entry first, then run the script again');
      rl.close();
      process.exit(0);
    }
    
    // Show confirmation
    console.log('\n📋 Sync Configuration:');
    console.log('─'.repeat(50));
    console.log(`📤 Source:      ${sourceSuite.name || 'Unnamed'} - ${sourceSuite.documentId}`);
    console.log(`📥 Destination: ${destinationSuite.name || 'Unnamed'} - ${destinationSuite.documentId}`);
    console.log(`🌐 Locale:      ${locale} (${SUPPORTED_LOCALES[locale]}) ✅ Confirmed created`);
    console.log('─'.repeat(50));
    
    const confirm = await askQuestion(
      rl,
      '\n✅ Proceed with synchronization? (y/N): ',
      (input) => {
        const normalized = input.toLowerCase();
        if (normalized !== 'y' && normalized !== 'yes' && normalized !== 'n' && normalized !== 'no' && normalized !== '') {
          return { valid: false, message: 'Please enter y/yes or n/no' };
        }
        return { valid: true };
      }
    );
    
    rl.close();
    
    if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
      console.log('\n🚀 Starting synchronization...\n');
      return { 
        sourceDocumentId: sourceSuite.documentId, 
        destinationDocumentId: destinationSuite.documentId, 
        locale 
      };
    } else {
      console.log('❌ Synchronization cancelled by user');
      process.exit(0);
    }
    
  } catch (error) {
    rl.close();
    console.error('❌ Wizard error:', error.message);
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  let sourceDocumentId, destinationDocumentId, locale;
  
  // If no arguments provided, run interactive wizard
  if (args.length === 0) {
    const wizardResult = await runWizard();
    sourceDocumentId = wizardResult.sourceDocumentId;
    destinationDocumentId = wizardResult.destinationDocumentId;
    locale = wizardResult.locale;
  } 
  // If arguments provided, validate and use them
  else if (args.length >= 2 && args.length <= 3) {
    [sourceDocumentId, destinationDocumentId, locale = 'en'] = args;
    
    // Validate document IDs
    if (!validateDocumentId(sourceDocumentId)) {
      console.error('❌ Invalid source document ID');
      process.exit(1);
    }
    
    if (!validateDocumentId(destinationDocumentId)) {
      console.error('❌ Invalid destination document ID');
      process.exit(1);
    }
    
    if (sourceDocumentId === destinationDocumentId) {
      console.error('❌ Source and destination document IDs cannot be the same');
      process.exit(1);
    }
    
    // Validate locale
    if (!SUPPORTED_LOCALES[locale]) {
      console.error('❌ Unsupported locale. Supported locales are:');
      Object.keys(SUPPORTED_LOCALES).forEach(loc => {
        console.error(`   ${loc} (${SUPPORTED_LOCALES[loc]})`);
      });
      process.exit(1);
    }
  }
  // Invalid number of arguments
  else {
    console.error('❌ Invalid arguments!');
    console.log('\n📖 Usage:');
    console.log('  # Interactive wizard (recommended)');
    console.log('  node sync-suite.js');
    console.log('');
    console.log('  # Command line with arguments');
    console.log('  node sync-suite.js <source-documentId> <destination-documentId> [locale]');
    console.log('\n📝 Examples:');
    console.log('  node sync-suite.js');
    console.log('  node sync-suite.js i0n9t1b9ktzszafp237jaqvo j2n8s3c7ltyrbgep348kbrwp');
    console.log('  node sync-suite.js i0n9t1b9ktzszafp237jaqvo j2n8s3c7ltyrbgep348kbrwp ja');
    console.log('\n🌐 Supported locales:');
    Object.keys(SUPPORTED_LOCALES).forEach(loc => {
      console.log(`  ${loc} (${SUPPORTED_LOCALES[loc]})`);
    });
    process.exit(1);
  }
  
  // Start synchronization
  await syncSuite(sourceDocumentId, destinationDocumentId, locale);
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  });
}

module.exports = { syncSuite, fetchSourceSuite, updateDestinationSuite };
