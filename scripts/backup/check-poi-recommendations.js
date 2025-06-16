const axios = require('axios');
require('dotenv').config();

const DESTINATION_BASE_URL = process.env.DEST_STRAPI_URL;
const DESTINATION_API_TOKEN = process.env.DEST_API_TOKEN;

async function checkPoiRecommendations() {
    try {
        console.log('Checking poi-recommendation entries in destination...');
        
        const response = await axios.get(`${DESTINATION_BASE_URL}/api/poi-recommendations`, {
            headers: {
                'Authorization': `Bearer ${DESTINATION_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            params: {
                populate: 'poi',
                'pagination[pageSize]': 100
            }
        });

        const data = response.data;
        console.log(`\nFound ${data.data.length} poi-recommendation entries:`);
        
        data.data.forEach((entry, index) => {
            console.log(`\n${index + 1}. ID: ${entry.id}, DocumentId: ${entry.documentId}`);
            console.log(`   Title: ${entry.title}`);
            console.log(`   Locale: ${entry.locale}`);
            console.log(`   POI: ${entry.poi ? `ID ${entry.poi.id}, DocumentId: ${entry.poi.documentId}` : 'NULL'}`);
        });

        const withPoi = data.data.filter(entry => entry.poi);
        const withoutPoi = data.data.filter(entry => !entry.poi);
        
        console.log(`\n=== SUMMARY ===`);
        console.log(`Total entries: ${data.data.length}`);
        console.log(`With POI relation: ${withPoi.length}`);
        console.log(`Without POI relation (NULL): ${withoutPoi.length}`);
        
        if (withoutPoi.length > 0) {
            console.log(`\nEntries with NULL poi field:`);
            withoutPoi.forEach(entry => {
                console.log(`- ${entry.title} (${entry.locale})`);
            });
        }

    } catch (error) {
        console.error('Error checking poi-recommendations:', error.response?.data || error.message);
    }
}

checkPoiRecommendations();
