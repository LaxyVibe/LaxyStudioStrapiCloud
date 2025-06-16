const axios = require('axios');
require('dotenv').config();

const SOURCE_BASE_URL = process.env.SOURCE_STRAPI_URL;
const SOURCE_API_TOKEN = process.env.SOURCE_API_TOKEN;
const DEST_BASE_URL = process.env.DEST_STRAPI_URL;
const DEST_API_TOKEN = process.env.DEST_API_TOKEN;

async function analyzePoiRecommendationMapping() {
    try {
        console.log('=== ANALYZING POI-RECOMMENDATION MAPPING ISSUE ===\n');
        
        // 1. Get the 3 migrated poi-recommendations from destination
        console.log('1. Checking migrated poi-recommendation entries in DESTINATION...');
        const destPoiRecsResponse = await axios.get(`${DEST_BASE_URL}/api/poi-recommendations`, {
            headers: { 'Authorization': `Bearer ${DEST_API_TOKEN}` },
            params: { populate: 'poi', 'pagination[pageSize]': 100 }
        });
        
        const destPoiRecs = destPoiRecsResponse.data.data;
        console.log(`Found ${destPoiRecs.length} poi-recommendations in destination:`);
        destPoiRecs.forEach((entry, i) => {
            console.log(`  ${i+1}. ID: ${entry.id}, DocumentId: ${entry.documentId}`);
        });
        
        // 2. Get their source equivalents to see which POIs they should reference
        console.log('\n2. Finding source equivalents and their POI references...');
        const sourcePoiRecsResponse = await axios.get(`${SOURCE_BASE_URL}/api/poi-recommendations`, {
            headers: { 'Authorization': `Bearer ${SOURCE_API_TOKEN}` },
            params: { populate: 'poi', 'pagination[pageSize]': 100 }
        });
        
        const sourcePoiRecs = sourcePoiRecsResponse.data.data;
        
        // Find the 3 that were migrated (IDs 13, 12, 7 based on Step 1 mappings)
        const migratedSourceIds = [13, 12, 7];
        
        console.log('Migrated poi-recommendations and their POI references:');
        for (const sourceId of migratedSourceIds) {
            const sourceEntry = sourcePoiRecs.find(entry => entry.id === sourceId);
            if (sourceEntry) {
                console.log(`\n  Source ID ${sourceId} (DocumentId: ${sourceEntry.documentId}):`);
                console.log(`    POI Reference: ${sourceEntry.poi ? `ID ${sourceEntry.poi.id} (DocumentId: ${sourceEntry.poi.documentId})` : 'NULL'}`);
                
                if (sourceEntry.poi) {
                    // Check if this POI exists in destination
                    console.log('    Checking if this POI exists in destination...');
                    const destPoisResponse = await axios.get(`${DEST_BASE_URL}/api/pois`, {
                        headers: { 'Authorization': `Bearer ${DEST_API_TOKEN}` },
                        params: { 'pagination[pageSize]': 100 }
                    });
                    
                    const destPois = destPoisResponse.data.data;
                    const matchingDestPoi = destPois.find(poi => {
                        // Try to find by any means - title, or other identifying info
                        return false; // We'll check manually
                    });
                    
                    console.log(`    Destination POIs:`);
                    destPois.forEach((poi, i) => {
                        console.log(`      ${i+1}. ID: ${poi.id}, DocumentId: ${poi.documentId}, Title: ${poi.title || 'undefined'}`);
                    });
                }
            }
        }
        
        // 3. Check Step 1 mappings to see what POI mappings exist
        console.log('\n3. Checking Step 1 POI mappings...');
        const fs = require('fs');
        const path = require('path');
        const mappingsPath = path.join(__dirname, 'step1-en-content-mappings.json');
        const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
        
        console.log('POI mappings in Step 1:');
        Object.entries(mappings.idMappings).forEach(([key, value]) => {
            if (key.includes('api::poi.poi_')) {
                console.log(`  ${key} → ${value}`);
            }
        });
        
        // 4. Check what the Step 3 relation migrator would look for
        console.log('\n4. Simulating Step 3 mapping logic...');
        const neededPoiIds = [10, 5, 20]; // Based on earlier analysis
        
        for (const poiId of neededPoiIds) {
            const mappingKey = `api::poi.poi_${poiId}`;
            const mappedId = mappings.idMappings[mappingKey];
            console.log(`  Looking for: ${mappingKey} → ${mappedId || 'NOT FOUND'}`);
        }
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

analyzePoiRecommendationMapping();
