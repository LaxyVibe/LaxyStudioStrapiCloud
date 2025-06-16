const axios = require('axios');
require('dotenv').config();

const SOURCE_BASE_URL = process.env.SOURCE_STRAPI_URL;
const SOURCE_API_TOKEN = process.env.SOURCE_API_TOKEN;

async function checkSourcePoiRecommendations() {
    try {
        console.log('Checking poi-recommendation entries in SOURCE...');
        
        const response = await axios.get(`${SOURCE_BASE_URL}/api/poi-recommendations`, {
            headers: {
                'Authorization': `Bearer ${SOURCE_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            params: {
                populate: 'poi',
                'pagination[pageSize]': 100
            }
        });

        const data = response.data;
        console.log(`\nFound ${data.data.length} poi-recommendation entries in SOURCE:`);
        
        data.data.forEach((entry, index) => {
            console.log(`\n${index + 1}. ID: ${entry.id}, DocumentId: ${entry.documentId}`);
            console.log(`   Title: ${entry.title}`);
            console.log(`   Locale: ${entry.locale}`);
            console.log(`   POI: ${entry.poi ? `ID ${entry.poi.id}, DocumentId: ${entry.poi.documentId}, Title: ${entry.poi.title}` : 'NULL'}`);
        });

        // Check what POI IDs are referenced
        const referencedPoiIds = [...new Set(data.data.filter(entry => entry.poi).map(entry => entry.poi.id))];
        console.log(`\n=== POI REFERENCES ===`);
        console.log(`Referenced POI IDs: ${referencedPoiIds.join(', ')}`);

    } catch (error) {
        console.error('Error checking source poi-recommendations:', error.response?.data || error.message);
    }
}

async function checkSourcePois() {
    try {
        console.log('\n\nChecking POI entries in SOURCE...');
        
        const response = await axios.get(`${SOURCE_BASE_URL}/api/pois`, {
            headers: {
                'Authorization': `Bearer ${SOURCE_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            params: {
                'pagination[pageSize]': 100
            }
        });

        const data = response.data;
        console.log(`\nFound ${data.data.length} POI entries in SOURCE:`);
        
        data.data.forEach((entry, index) => {
            console.log(`${index + 1}. ID: ${entry.id}, DocumentId: ${entry.documentId}`);
            console.log(`   Title: ${entry.title}`);
            console.log(`   Locale: ${entry.locale}`);
        });

    } catch (error) {
        console.error('Error checking source POIs:', error.response?.data || error.message);
    }
}

async function main() {
    await checkSourcePoiRecommendations();
    await checkSourcePois();
}

main();
