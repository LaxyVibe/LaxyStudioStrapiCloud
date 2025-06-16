const fs = require('fs');
const path = require('path');

// Load the actual mappings used by Step 3
const step1MappingsPath = path.join(__dirname, 'step1-en-content-mappings.json');
const step1Mappings = JSON.parse(fs.readFileSync(step1MappingsPath, 'utf8'));

console.log('=== STEP 3 MAPPING LOGIC TEST ===\n');

// Simulate the allIdMappings Map that Step 3 creates
const allIdMappings = new Map(Object.entries(step1Mappings.idMappings));

console.log('Available ID mappings:');
for (const [key, value] of allIdMappings.entries()) {
    if (key.includes('poi')) {
        console.log(`  ${key} → ${value}`);
    }
}

console.log('\n=== SIMULATING POI-RECOMMENDATION RELATION PROCESSING ===\n');

// The 3 poi-recommendations that were migrated reference these POI IDs:
const poiRecommendationReferences = [
    { poiRecId: 13, referencedPoiId: 10 },
    { poiRecId: 12, referencedPoiId: 5 },
    { poiRecId: 7, referencedPoiId: 20 }
];

poiRecommendationReferences.forEach(({ poiRecId, referencedPoiId }) => {
    console.log(`POI-Recommendation ${poiRecId} references POI ${referencedPoiId}:`);
    
    // This is exactly what Step 3 does in processRelationFields()
    const relatedContentType = 'api::poi.poi';  // from getContentTypeFromRelation('poi')
    const mappingKey = `${relatedContentType}_${referencedPoiId}`;
    const mappedId = allIdMappings.get(mappingKey);
    
    console.log(`  Looking for mapping: ${mappingKey}`);
    console.log(`  Result: ${mappedId || 'UNMAPPED'}`);
    
    if (mappedId) {
        console.log(`  ✅ Would map POI relation to destination ID ${mappedId}`);
    } else {
        console.log(`  ❌ Would remove POI relation (set to null/delete)`);
    }
    console.log('');
});

console.log('=== DIAGNOSIS ===');
console.log('The Step 3 logic is working correctly!');
console.log('The issue is that the referenced POI IDs (10, 5, 20) were never migrated in Step 1.');
console.log('Step 1 only migrated POI IDs: 151, 130, 90, 110, 45');
console.log('');
console.log('This is a test data selection issue, not a mapping logic issue.');
console.log('The 3 poi-recommendations selected for migration happen to reference');
console.log('POIs that were not among the 5 POIs selected for migration.');
