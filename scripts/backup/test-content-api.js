#!/usr/bin/env node

/**
 * Content API Test - Test content fetching from source
 */

const config = require('./migration-config');
const axios = require('axios');

async function testContentAPI() {
  console.log('🧪 Testing Content API Access...');
  console.log(`Source: ${config.source.url}`);
  console.log(`Using API token: ${config.source.apiToken ? 'Yes' : 'No'}`);

  const contentTypes = [
    'tag-labels',
    'stays', 
    'pois',
    'suites',
    'poi-recommendations',
    'hub-application-config'
  ];

  for (const ct of contentTypes) {
    try {
      console.log(`\n📋 Testing ${ct}...`);
      
      const response = await axios.get(`${config.source.url}/api/${ct}`, {
        headers: { Authorization: `Bearer ${config.source.apiToken}` },
        params: { 'pagination[pageSize]': 1 },
        timeout: 10000
      });
      
      console.log(`   ✅ Success - ${response.data.data?.length || 0} entries found`);
      console.log(`   📊 Meta:`, response.data.meta);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.status} - ${error.response?.statusText}`);
      if (error.response?.data) {
        console.log(`   📋 Details:`, error.response.data);
      }
    }
  }
  
  console.log('\n🎉 Content API test completed');
  process.exit(0);
}

testContentAPI().catch(console.error);
