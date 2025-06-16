const axios = require('axios');

const config = require('./migration-config');

async function testContentTypes() {
  console.log('Testing content types structure...');
  
  try {
    // Test getting content types from content-type-builder API
    console.log('\n1. Testing content-type-builder API...');
    const response = await axios.get(`${config.source.url}/api/content-type-builder/content-types`, {
      headers: { Authorization: `Bearer ${config.source.apiToken}` }
    });
    
    console.log(`Found ${response.data.data.length} content types`);
    
    // Show structure of first custom API content type
    const customTypes = response.data.data.filter(ct => ct.uid.startsWith('api::'));
    if (customTypes.length > 0) {
      console.log('\nFirst custom content type structure:');
      console.log(JSON.stringify(customTypes[0], null, 2));
    }
    
    // Test accessing content directly using regular API
    console.log('\n2. Testing direct API access...');
    
    const testEndpoints = [
      'tag-labels',
      'stays', 
      'pois',
      'suites',
      'poi-recommendations',
      'hub-application-config'
    ];
    
    for (const endpoint of testEndpoints) {
      try {
        const testResponse = await axios.get(`${config.source.url}/api/${endpoint}?pagination[pageSize]=1`, {
          headers: { Authorization: `Bearer ${config.source.apiToken}` }
        });
        console.log(`✅ ${endpoint}: ${testResponse.data.meta?.pagination?.total || 'accessible'} items`);
      } catch (error) {
        console.log(`❌ ${endpoint}: ${error.response?.status} - ${error.response?.statusText || error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testContentTypes();
