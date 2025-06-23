#!/usr/bin/env node

/**
 * POI Recommendation Sync Tool for Strapi v5
 * 
 * UPDATED APPROACH (v2.0):
 * 1. Find all POI recommendations with null POI field in target language using:
 *    GET /api/poi-recommendations?filters[poi][$null]=true&populate=*&locale={target-locale}
 * 
 * 2. For each result, check its English locale for POI reference
 * 
 * 3. If POI is connected in English, connect it to target language using 
 *    Strapi v5 relations API with connect syntax:
 *    PUT /api/poi-recommendations/{documentId}?locale={target-locale}
 *    Body: { data: { poi: { connect: [poiDocumentId] } } }
 * 
 * IMPROVEMENTS:
 * - Uses Strapi v5 relations API (connect/disconnect syntax)
 * - More efficient filtering with null POI queries
 * - Targets only items that actually need syncing
 * - Better error handling and logging
 * 
 * REFERENCES:
 * - Strapi v5 Relations API: https://docs.strapi.io/cms/api/rest/relations
 * - Null filtering: ?filters[poi][$null]=true
 */

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
 * Fetch POI recommendations with null POI field in target locale
 */
async function fetchPoiRecommendationsWithNullPoi(locale) {
  console.log(`🔍 Fetching POI recommendations with null POI in locale: ${locale}`);
  
  const url = `${BASE_URL}/api/poi-recommendations?filters[poi][$null]=true&populate=*&locale=${locale}&pagination[pageSize]=100`;
  
  try {
    const response = await makeRequest(url);
    console.log(`✅ Found ${response.data.length} POI recommendations with null POI in ${locale}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to fetch POI recommendations with null POI for ${locale}:`, error.message);
    throw error;
  }
}

/**
 * Fetch POI recommendation from English locale to get POI reference
 */
async function fetchEnglishPoiRecommendation(documentId) {
  console.log(`🔍 Fetching English POI recommendation data for documentId: ${documentId}`);
  
  const url = `${BASE_URL}/api/poi-recommendations/${documentId}?locale=en&populate=poi`;
  
  try {
    const response = await makeRequest(url);
    console.log('✅ Successfully fetched English POI recommendation data');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch English POI recommendation:', error.message);
    throw error;
  }
}

/**
 * Fetch POI recommendation data from target locale
 */
async function fetchTargetPoiRecommendation(documentId, locale) {
  console.log(`🔍 Fetching ${locale} POI recommendation data for documentId: ${documentId}`);
  
  const url = `${BASE_URL}/api/poi-recommendations/${documentId}?locale=${locale}&populate=poi`;
  
  try {
    const response = await makeRequest(url);
    console.log(`✅ Successfully fetched ${locale} POI recommendation data`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to fetch ${locale} POI recommendation:`, error.message);
    throw error;
  }
}

/**
 * Update POI recommendation with POI reference using Strapi v5 relations API
 */
async function updatePoiRecommendation(documentId, poiDocumentId, locale) {
  console.log(`🔄 Updating ${locale} POI recommendation documentId: ${documentId} with POI: ${poiDocumentId}`);
  
  const url = `${BASE_URL}/api/poi-recommendations/${documentId}?locale=${locale}`;
  
  const updateData = {
    data: {
      poi: {
        connect: [poiDocumentId]
      }
    }
  };
  
  // Debug: Log the payload being sent
  console.log('📤 Update payload:', JSON.stringify(updateData, null, 2));
  
  try {
    const response = await makeRequest(url, 'PUT', updateData);
    console.log('✅ Successfully updated POI recommendation');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to update POI recommendation:', error.message);
    console.error('📤 Payload that failed:', JSON.stringify(updateData, null, 2));
    throw error;
  }
}

/**
 * Fetch all POI recommendations list for a specific locale
 */
async function fetchAllPoiRecommendations(locale = 'en') {
  console.log(`🔍 Fetching all POI recommendations for locale: ${locale}...`);
  
  const url = `${BASE_URL}/api/poi-recommendations?pagination[pageSize]=100&locale=${locale}`;
  
  try {
    const response = await makeRequest(url);
    console.log(`✅ Successfully fetched ${response.data.length} POI recommendations for ${locale}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to fetch POI recommendations list for ${locale}:`, error.message);
    throw error;
  }
}

/**
 * Check if POI recommendation needs sync (has English POI but no target locale POI)
 */
async function checkIfNeedsSync(documentId, targetLocale) {
  try {
    // Fetch English version
    const englishData = await fetchEnglishPoiRecommendation(documentId);
    
    // If English doesn't have POI, skip
    if (!englishData.poi || !englishData.poi.documentId) {
      return { needsSync: false, reason: 'No POI in English locale' };
    }
    
    // Fetch target locale version
    try {
      const targetData = await fetchTargetPoiRecommendation(documentId, targetLocale);
      
      // If target already has POI, skip
      if (targetData.poi && targetData.poi.documentId) {
        return { 
          needsSync: false, 
          reason: `Already has POI in ${targetLocale}`,
          currentPoi: targetData.poi.documentId 
        };
      }
      
      // Target exists but has no POI - needs sync
      return { 
        needsSync: true, 
        englishPoi: englishData.poi.documentId,
        englishPoiLabel: englishData.poi.label 
      };
      
    } catch (error) {
      // Target locale doesn't exist
      return { 
        needsSync: false, 
        reason: `Target locale ${targetLocale} doesn't exist - create manually first` 
      };
    }
    
  } catch (error) {
    return { 
      needsSync: false, 
      reason: `Error checking: ${error.message}` 
    };
  }
}

/**
 * Main sync function - Updated for Strapi v5 relations API
 */
async function syncPoiRecommendation(documentId, targetLocale) {
  try {
    console.log('🚀 Starting POI recommendation synchronization...');
    console.log(`📋 POI Recommendation: ${documentId}`);
    console.log(`🎯 Target Locale: ${targetLocale}`);
    console.log('─'.repeat(50));
    
    // Step 1: Fetch English POI recommendation data
    const englishData = await fetchEnglishPoiRecommendation(documentId);
    
    if (!englishData.poi || !englishData.poi.documentId) {
      throw new Error('English POI recommendation does not have a POI reference. Please set the POI in English first.');
    }
    
    const poiDocumentId = englishData.poi.documentId;
    console.log(`📍 Found POI reference in English: ${poiDocumentId} (${englishData.poi.label || 'Unnamed POI'})`);
    
    // Step 2: Check if target locale exists
    try {
      const targetData = await fetchTargetPoiRecommendation(documentId, targetLocale);
      console.log(`✅ Target locale ${targetLocale} exists for POI recommendation`);
      
      if (targetData.poi && targetData.poi.documentId === poiDocumentId) {
        console.log(`⚠️  POI reference is already set correctly in ${targetLocale} locale`);
        console.log(`📍 Current POI: ${targetData.poi.documentId} (${targetData.poi.label || 'Unnamed POI'})`);
        
        // Ask if user wants to continue anyway
        console.log('\n🤔 The POI reference is already correct. Do you want to continue anyway?');
      }
    } catch (error) {
      console.error(`❌ Target locale ${targetLocale} may not exist. Please create it manually first.`);
      throw error;
    }
    
    // Step 3: Update target locale with POI reference using Strapi v5 relations API
    const updatedData = await updatePoiRecommendation(documentId, poiDocumentId, targetLocale);
    
    console.log('─'.repeat(50));
    console.log('🎉 POI recommendation synchronization completed successfully!');
    console.log(`✨ Connected POI recommendation in ${targetLocale} locale`);
    
    // Log summary
    const summary = {
      poiRecommendationId: documentId,
      targetLocale: targetLocale,
      poiDocumentId: poiDocumentId,
      poiLabel: englishData.poi.label,
      relationsApiUsed: 'Strapi v5 connect syntax',
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
 * Batch sync POI recommendations for a target locale - NEW APPROACH
 * 1. Find all POI recommendations with null POI field in target language
 * 2. For each result, fetch its English locale and check if POI is connected
 * 3. If POI is connected in English, connect it to the target language
 */
async function batchSyncPoiRecommendations(targetLocale) {
  try {
    console.log('🚀 Starting batch POI recommendation synchronization (NEW APPROACH)...');
    console.log(`🎯 Target Locale: ${targetLocale}`);
    console.log('─'.repeat(70));
    
    // Step 1: Fetch POI recommendations with null POI field in target locale
    console.log(`📋 Fetching ${targetLocale} POI recommendations with null POI...`);
    const targetRecommendationsWithNullPoi = await fetchPoiRecommendationsWithNullPoi(targetLocale);
    
    if (targetRecommendationsWithNullPoi.length === 0) {
      console.log(`✅ No POI recommendations found with null POI in ${targetLocale} locale`);
      console.log('🎉 All POI recommendations in this locale already have POI references!');
      return;
    }
    
    console.log(`📊 Found ${targetRecommendationsWithNullPoi.length} POI recommendations with null POI in ${targetLocale} locale`);
    console.log('🔍 Checking English locale for POI references...\n');
    
    // Step 2: For each recommendation, check English locale for POI reference
    const syncCandidates = [];
    const skippedItems = [];
    
    for (let i = 0; i < targetRecommendationsWithNullPoi.length; i++) {
      const recommendation = targetRecommendationsWithNullPoi[i];
      const documentId = recommendation.documentId;
      
      process.stdout.write(`\r🔍 Checking ${i + 1}/${targetRecommendationsWithNullPoi.length}: ${documentId}...`);
      
      try {
        // Fetch English version to check for POI reference
        const englishData = await fetchEnglishPoiRecommendation(documentId);
        
        if (englishData.poi && englishData.poi.documentId) {
          // English has POI - candidate for sync
          syncCandidates.push({
            documentId,
            englishPoi: englishData.poi.documentId,
            englishPoiLabel: englishData.poi.label || 'Unnamed POI'
          });
        } else {
          // English has no POI
          skippedItems.push({
            documentId,
            reason: 'No POI reference in English locale (source)',
            currentPoi: null
          });
        }
      } catch (error) {
        // English locale doesn't exist for this documentId
        skippedItems.push({
          documentId,
          reason: 'English locale entry does not exist',
          currentPoi: null
        });
      }
    }
    
    console.log('\n'); // New line after progress indicator
    
    // Step 3: Display analysis summary
    console.log('📊 Batch Sync Analysis (NEW APPROACH):');
    console.log('─'.repeat(70));
    console.log(`✅ Items that need sync: ${syncCandidates.length}`);
    console.log(`⚠️  Items skipped: ${skippedItems.length}`);
    console.log('');
    
    if (syncCandidates.length === 0) {
      console.log('🎉 No POI recommendations need synchronization!');
      console.log('\n📋 Skipped items breakdown:');
      
      const reasonCounts = {};
      skippedItems.forEach(item => {
        reasonCounts[item.reason] = (reasonCounts[item.reason] || 0) + 1;
      });
      
      Object.entries(reasonCounts).forEach(([reason, count]) => {
        console.log(`   • ${reason}: ${count} items`);
      });
      
      return;
    }
    
    // Step 4: Show items that will be synced
    console.log('📋 Items that will be synchronized:');
    console.log('─'.repeat(70));
    syncCandidates.forEach((item, index) => {
      console.log(`${index + 1}. ${item.documentId} → POI: ${item.englishPoi} (${item.englishPoiLabel})`);
    });
    
    console.log('\n📋 Items that will be skipped:');
    console.log('─'.repeat(70));
    const groupedSkipped = {};
    skippedItems.forEach(item => {
      if (!groupedSkipped[item.reason]) {
        groupedSkipped[item.reason] = [];
      }
      groupedSkipped[item.reason].push(item);
    });
    
    Object.entries(groupedSkipped).forEach(([reason, items]) => {
      console.log(`📌 ${reason}: ${items.length} items`);
      items.slice(0, 3).forEach(item => {
        console.log(`   • ${item.documentId}`);
      });
      if (items.length > 3) {
        console.log(`   • ... and ${items.length - 3} more`);
      }
    });
    
    // Step 5: Confirm before proceeding
    console.log('\n⚠️  BATCH SYNC CONFIRMATION');
    console.log('═'.repeat(70));
    console.log(`🎯 Target Locale: ${targetLocale} (${SUPPORTED_LOCALES[targetLocale]})`);
    console.log(`📊 Items to sync: ${syncCandidates.length}`);
    console.log(`📊 Items to skip: ${skippedItems.length}`);
    console.log('');
    console.log('🚨 This will connect POI references for all listed items!');
    console.log('═'.repeat(70));
    
    // For batch mode, we need to create a simple confirmation
    console.log('⏳ Starting batch sync in 3 seconds... (Press Ctrl+C to cancel)');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 6: Perform batch sync
    console.log('\n🚀 Starting batch synchronization...\n');
    
    const syncResults = {
      success: [],
      failed: []
    };
    
    for (let i = 0; i < syncCandidates.length; i++) {
      const item = syncCandidates[i];
      
      try {
        console.log(`\n[${i + 1}/${syncCandidates.length}] 🔄 Syncing ${item.documentId}...`);
        console.log(`📍 Connecting POI: ${item.englishPoi} (${item.englishPoiLabel})`);
        
        await updatePoiRecommendation(item.documentId, item.englishPoi, targetLocale);
        
        syncResults.success.push(item);
        console.log(`✅ Success: ${item.documentId}`);
        
      } catch (error) {
        console.error(`❌ Failed: ${item.documentId} - ${error.message}`);
        syncResults.failed.push({
          ...item,
          error: error.message
        });
      }
      
      // Small delay between requests to avoid overwhelming the API
      if (i < syncCandidates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Step 7: Final summary
    console.log('\n' + '═'.repeat(70));
    console.log('🎉 BATCH SYNCHRONIZATION COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`✅ Successfully synced: ${syncResults.success.length} items`);
    console.log(`❌ Failed to sync: ${syncResults.failed.length} items`);
    console.log(`⚠️  Skipped items: ${skippedItems.length} items`);
    
    if (syncResults.failed.length > 0) {
      console.log('\n❌ Failed items:');
      syncResults.failed.forEach(item => {
        console.log(`   • ${item.documentId}: ${item.error}`);
      });
    }
    
    // Log final summary
    const finalSummary = {
      approach: 'NEW - Find null POI in target locale first',
      targetLocale,
      nullPoiItems: targetRecommendationsWithNullPoi.length,
      successfulSync: syncResults.success.length,
      failedSync: syncResults.failed.length,
      skippedItems: skippedItems.length,
      timestamp: new Date().toISOString()
    };
    
    console.log('\n📊 Final Batch Summary:');
    console.log(JSON.stringify(finalSummary, null, 2));
    
  } catch (error) {
    console.error('\n💥 Batch synchronization failed:');
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
 * Display locale selection menu and get user choice (excluding English)
 */
async function selectTargetLocale(rl) {
  console.log('\n🌐 Select target locale (English will be used as source):');
  const locales = Object.keys(SUPPORTED_LOCALES).filter(locale => locale !== 'en');
  locales.forEach((locale, index) => {
    console.log(`  ${index + 1}. ${locale} (${SUPPORTED_LOCALES[locale]})`);
  });
  
  const choice = await askQuestion(
    rl,
    `\nEnter your choice (1-${locales.length}): `,
    (input) => {
      const num = parseInt(input);
      if (isNaN(num) || num < 1 || num > locales.length) {
        return { valid: false, message: `Please enter a number between 1 and ${locales.length}` };
      }
      return { valid: true };
    }
  );
  
  const selectedIndex = parseInt(choice) - 1;
  return locales[selectedIndex];
}

/**
 * Display sync mode selection menu
 */
async function selectSyncMode(rl) {
  console.log('\n🔧 Select synchronization mode:');
  console.log('  1. Single POI Recommendation - Sync one specific POI recommendation');
  console.log('  2. Batch Sync - Sync all POI recommendations that need it for a target locale');
  
  const choice = await askQuestion(
    rl,
    '\nEnter your choice (1-2): ',
    (input) => {
      const num = parseInt(input);
      if (isNaN(num) || num < 1 || num > 2) {
        return { valid: false, message: 'Please enter 1 or 2' };
      }
      return { valid: true };
    }
  );
  
  return parseInt(choice);
}

/**
 * Interactive wizard to collect user input
 */
async function runWizard() {
  const rl = createInterface();
  
  console.log('🧙‍♂️ POI Recommendation Sync Wizard');
  console.log('═'.repeat(50));
  console.log('This wizard will help you sync POI references from English to other locales.');
  console.log('');
  
  try {
    // First, configure API settings
    await configureApiSettings(rl);
    
    // Select sync mode
    const syncMode = await selectSyncMode(rl);
    
    if (syncMode === 1) {
      // Single POI recommendation sync
      // Get POI recommendation document ID directly from user input
      const documentId = await askQuestion(
        rl,
        '\n📍 Enter POI recommendation document ID: ',
        (input) => {
          if (!input || input.trim().length === 0) {
            return { valid: false, message: 'Document ID cannot be empty' };
          }
          if (input.trim().length < 10) {
            return { valid: false, message: 'Document ID seems too short. Please enter a valid document ID.' };
          }
          return { valid: true };
        }
      );
      
      // Get target locale
      const targetLocale = await selectTargetLocale(rl);
      
      // Show locale creation warning
      console.log('\n⚠️  IMPORTANT PREREQUISITE');
      console.log('═'.repeat(50));
      console.log('🚨 DANGER: Before proceeding, you MUST manually create the');
      console.log(`   ${targetLocale} (${SUPPORTED_LOCALES[targetLocale]}) locale entry for the POI recommendation:`);
      console.log(`   ${documentId}`);
      console.log('');
      console.log('📝 Steps to create locale entry:');
      console.log('   1. Go to Strapi Admin Panel');
      console.log('   2. Navigate to Content Manager > POI Recommendations');
      console.log(`   3. Open POI recommendation: ${documentId}`);
      console.log(`   4. Switch to "${targetLocale}" locale using the locale selector`);
      console.log('   5. Save the entry (even if empty) to create the locale');
      console.log('');
      console.log('❌ If you skip this step, the synchronization will CRASH!');
      console.log('═'.repeat(50));
      
      const localeConfirm = await askQuestion(
        rl,
        `\n✅ I have manually created the ${targetLocale} locale entry for the POI recommendation (y/N): `,
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
      console.log(`📍 POI Recommendation: ${documentId}`);
      console.log(`📤 Source Locale:       en (English)`);
      console.log(`📥 Target Locale:       ${targetLocale} (${SUPPORTED_LOCALES[targetLocale]}) ✅ Confirmed created`);
      console.log('─'.repeat(50));
      
      const confirm = await askQuestion(
        rl,
        '\n✅ Proceed with POI reference synchronization? (y/N): ',
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
          mode: 'single',
          documentId: documentId, 
          locale: targetLocale 
        };
      } else {
        console.log('❌ Synchronization cancelled by user');
        process.exit(0);
      }
    } else {
      // Batch sync mode
      // Get target locale
      const targetLocale = await selectTargetLocale(rl);
      
      // Show batch sync info
      console.log('\n📊 BATCH SYNC MODE (NEW APPROACH)');
      console.log('═'.repeat(50));
      console.log('🎯 This will automatically sync POI recommendations using the NEW approach:');
      console.log('   1️⃣ Find ALL POI recommendations with NULL POI field in target locale');
      console.log('   2️⃣ For each found item, check English locale for POI reference');
      console.log('   3️⃣ If English has POI, connect it to the target locale');
      console.log('');
      console.log('✨ NEW FEATURES:');
      console.log('   • Uses Strapi v5 relations API (connect syntax)');
      console.log(`   • Targets only items with null POI in ${targetLocale}`);
      console.log('   • More efficient filtering with API queries');
      console.log('');
      console.log('⚠️  Items will be SKIPPED if:');
      console.log('   • English locale has no POI reference');
      console.log('   • English locale entry doesn\'t exist');
      console.log('');
      console.log('🔄 The script will:');
      console.log(`   1. Find POI recommendations with null POI in ${targetLocale}`);
      console.log('   2. Check their English counterparts for POI references');
      console.log('   3. Show you a summary before proceeding');
      console.log('   4. Connect POI references using Strapi v5 API');
      console.log('═'.repeat(50));
      
      const batchConfirm = await askQuestion(
        rl,
        `\n✅ Proceed with BATCH sync for ${targetLocale} locale? (y/N): `,
        (input) => {
          const normalized = input.toLowerCase();
          if (normalized !== 'y' && normalized !== 'yes' && normalized !== 'n' && normalized !== 'no' && normalized !== '') {
            return { valid: false, message: 'Please enter y/yes or n/no' };
          }
          return { valid: true };
        }
      );
      
      rl.close();
      
      if (batchConfirm.toLowerCase() === 'y' || batchConfirm.toLowerCase() === 'yes') {
        console.log('\n🚀 Starting batch analysis...\n');
        return { 
          mode: 'batch',
          locale: targetLocale 
        };
      } else {
        console.log('❌ Batch synchronization cancelled by user');
        process.exit(0);
      }
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
  
  let documentId, targetLocale, batchMode = false;
  
  // If no arguments provided, run interactive wizard
  if (args.length === 0) {
    const wizardResult = await runWizard();
    
    if (wizardResult.mode === 'single') {
      documentId = wizardResult.documentId;
      targetLocale = wizardResult.locale;
    } else if (wizardResult.mode === 'batch') {
      batchMode = true;
      targetLocale = wizardResult.locale;
    }
  } 
  // If arguments provided, validate and use them
  else if (args.length === 2) {
    [documentId, targetLocale] = args;
    
    // Validate document ID
    if (!validateDocumentId(documentId)) {
      console.error('❌ Invalid POI recommendation document ID');
      process.exit(1);
    }
    
    // Validate locale
    if (!SUPPORTED_LOCALES[targetLocale] || targetLocale === 'en') {
      console.error('❌ Invalid target locale. Supported target locales are:');
      Object.keys(SUPPORTED_LOCALES)
        .filter(loc => loc !== 'en')
        .forEach(loc => {
          console.error(`   ${loc} (${SUPPORTED_LOCALES[loc]})`);
        });
      process.exit(1);
    }
  }
  // Special batch mode argument
  else if (args.length === 1 && args[0].startsWith('--batch=')) {
    batchMode = true;
    targetLocale = args[0].replace('--batch=', '');
    
    // Validate locale
    if (!SUPPORTED_LOCALES[targetLocale] || targetLocale === 'en') {
      console.error('❌ Invalid target locale for batch mode. Supported target locales are:');
      Object.keys(SUPPORTED_LOCALES)
        .filter(loc => loc !== 'en')
        .forEach(loc => {
          console.error(`   ${loc} (${SUPPORTED_LOCALES[loc]})`);
        });
      process.exit(1);
    }
  }
  // Invalid number of arguments
  else {
    console.error('❌ Invalid arguments!');
    console.log('\n📖 Usage (Updated for Strapi v5):');
    console.log('  # Interactive wizard (recommended)');
    console.log('  node sync-poi-recommendation.js');
    console.log('');
    console.log('  # Single POI recommendation sync');
    console.log('  node sync-poi-recommendation.js <poi-recommendation-documentId> <target-locale>');
    console.log('');
    console.log('  # Batch sync for target locale (NEW APPROACH)');
    console.log('  node sync-poi-recommendation.js --batch=<target-locale>');
    console.log('\n📝 Examples:');
    console.log('  node sync-poi-recommendation.js');
    console.log('  node sync-poi-recommendation.js ggdg58lya8zch2xrc1ub65t5 zh-Hant');
    console.log('  node sync-poi-recommendation.js --batch=zh-Hant');
    console.log('  node sync-poi-recommendation.js --batch=ja');
    console.log('\n🆕 NEW APPROACH FEATURES:');
    console.log('  • Uses Strapi v5 relations API with connect syntax');
    console.log('  • Efficiently finds POI recommendations with null POI field first');
    console.log('  • Batch mode: uses filters[poi][$null]=true query');
    console.log('  • Better error handling and more targeted sync process');
    console.log('\n🌐 Supported target locales (English is always used as source):');
    Object.keys(SUPPORTED_LOCALES)
      .filter(loc => loc !== 'en')
      .forEach(loc => {
        console.log(`  ${loc} (${SUPPORTED_LOCALES[loc]})`);
      });
    process.exit(1);
  }
  
  // Start synchronization
  if (batchMode) {
    await batchSyncPoiRecommendations(targetLocale);
  } else {
    await syncPoiRecommendation(documentId, targetLocale);
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  syncPoiRecommendation, 
  batchSyncPoiRecommendations,
  fetchEnglishPoiRecommendation, 
  fetchPoiRecommendationsWithNullPoi,
  updatePoiRecommendation,
  checkIfNeedsSync,
  fetchAllPoiRecommendations
};
