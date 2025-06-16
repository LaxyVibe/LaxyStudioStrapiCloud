const axios = require('axios');
const config = require('./migration-config');

// Simple test script to debug API authentication issues
// This mimics exactly what Postman would send

async function testAuthentication() {
  const baseUrl = config.destination.url;
  const token = config.destination.apiToken;
  
  console.log('🔧 Testing API Authentication...');
  console.log('Base URL:', baseUrl);
  console.log('Token length:', token.length);
  console.log('Token first 20 chars:', token.substring(0, 20) + '...');
  
  // Test 1: GET request (should work)
  console.log('\n📖 Test 1: GET tag-labels');
  try {
    const response = await axios.get(`${baseUrl}/api/tag-labels`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    console.log('✅ GET Success:', response.status);
    console.log('   Response data count:', response.data?.data?.length || 0);
  } catch (error) {
    console.log('❌ GET Failed:', error.response?.status || 'Network Error');
    console.log('   Error message:', error.response?.data?.error?.message || error.message);
  }
  
  // Test 2: Check user permissions
  console.log('\n👤 Test 2: Check API token user info');
  try {
    const response = await axios.get(`${baseUrl}/api/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    console.log('✅ User info success:', response.status);
    console.log('   User ID:', response.data?.id);
    console.log('   User email:', response.data?.email);
  } catch (error) {
    console.log('❌ User info failed:', error.response?.status || 'Network Error');
    console.log('   Error message:', error.response?.data?.error?.message || error.message);
  }
  
  // Test 3: Simple POST request
  console.log('\n📝 Test 3: POST tag-label');
  try {
    const testData = {
      data: {
        label: `Test Tag ${Date.now()}`,
        slug: `test-tag-${Date.now()}`,
        locale: 'en'
      }
    };
    
    console.log('   Sending data:', JSON.stringify(testData, null, 2));
    
    const response = await axios.post(`${baseUrl}/api/tag-labels`, testData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('✅ POST Success:', response.status);
    console.log('   Created ID:', response.data?.data?.id);
    
    // Clean up - delete the test item
    if (response.data?.data?.id) {
      try {
        await axios.delete(`${baseUrl}/api/tag-labels/${response.data.data.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('   ✅ Cleanup: Test item deleted');
      } catch (cleanupError) {
        console.log('   ⚠️ Cleanup failed:', cleanupError.response?.status);
      }
    }
    
  } catch (error) {
    console.log('❌ POST Failed:', error.response?.status || 'Network Error');
    console.log('   Error message:', error.response?.data?.error?.message || error.message);
    console.log('   Full error details:', JSON.stringify(error.response?.data, null, 2));
  }
  
  // Test 4: Check available content types
  console.log('\n📋 Test 4: Check content types');
  try {
    const response = await axios.get(`${baseUrl}/api/content-manager/content-types`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    console.log('✅ Content types success:', response.status);
    const contentTypes = response.data?.data || [];
    console.log('   Available content types:');
    contentTypes.forEach(ct => {
      console.log(`     - ${ct.uid}`);
    });
  } catch (error) {
    console.log('❌ Content types failed:', error.response?.status || 'Network Error');
    console.log('   Error message:', error.response?.data?.error?.message || error.message);
  }
}

// Run the test
if (require.main === module) {
  testAuthentication()
    .then(() => {
      console.log('\n🏁 Authentication test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testAuthentication };
