const axios = require('axios');
require('dotenv').config();

const DESTINATION_BASE_URL = process.env.DEST_STRAPI_URL;
const DESTINATION_API_TOKEN = process.env.DEST_API_TOKEN;

async function checkPois() {
    try {
        console.log('Checking POI entries in destination...');
        
        const response = await axios.get(`${DESTINATION_BASE_URL}/api/pois`, {
            headers: {
                'Authorization': `Bearer ${DESTINATION_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            params: {
                'pagination[pageSize]': 100
            }
        });

        const data = response.data;
        console.log(`\nFound ${data.data.length} POI entries:`);
        
        data.data.forEach((entry, index) => {
            console.log(`${index + 1}. ID: ${entry.id}, DocumentId: ${entry.documentId}`);
            console.log(`   Title: ${entry.title}`);
            console.log(`   Locale: ${entry.locale}`);
        });

    } catch (error) {
        console.error('Error checking POIs:', error.response?.data || error.message);
    }
}

checkPois();
