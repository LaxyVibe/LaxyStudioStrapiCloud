#!/usr/bin/env node

/**
 * Simple test to check Strapi v5 API access
 */

const config = require('./migration-config');
const axios = require('axios');

async function testAPI() {
  console.log('🔍 Testing Strapi v5 API access...');
  
  const sourceToken = config.source.apiToken;
  const destToken = config.destination.apiToken;
  
  console.log('Source URL:', config.source.url);
  console.log('Destination URL:', config.destination.url);
  
  // Test source API
  try {
    console.log('\n📡 Testing source API...');
    const response = await axios.get(`${config.source.url}/api/tag-labels?pagination[pageSize]=1`, {
      headers: { Authorization: `Bearer ${sourceToken}` }
    });
    console.log('✅ Source API working');
    console.log('Response structure:', Object.keys(response.data));
    if (response.data.data) {
      console.log('First entry:', response.data.data[0] ? Object.keys(response.data.data[0]) : 'No entries');
    }
  } catch (error) {
    console.log('❌ Source API error:', error.response?.status, error.response?.data || error.message);
  }
  
  // Test destination API
  try {
    console.log('\n📡 Testing destination API...');
    const response = await axios.get(`${config.destination.url}/api/tag-labels?pagination[pageSize]=1`, {
      headers: { Authorization: `Bearer ${destToken}` }
    });
    console.log('✅ Destination API working');
    console.log('Response structure:', Object.keys(response.data));
  } catch (error) {
    console.log('❌ Destination API error:', error.response?.status, error.response?.data || error.message);
  }
}

testAPI().catch(console.error);
