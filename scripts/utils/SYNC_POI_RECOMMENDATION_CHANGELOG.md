# POI Recommendation Sync Tool - Changelog

## Version 2.0 - Updated Approach for Strapi v5

### 🆕 NEW APPROACH

The sync logic has been completely rewritten to be more efficient and use Strapi v5's relations API properly.

#### Previous Approach (v1.0):
1. Fetch ALL POI recommendations in target locale
2. Check each one to see if it has a POI reference
3. For items without POI, check English locale
4. Update using direct field assignment

#### NEW Approach (v2.0):
1. **Find POI recommendations with null POI field first** using efficient API query:
   ```
   GET /api/poi-recommendations?filters[poi][$null]=true&populate=*&locale={target-locale}
   ```

2. **For each result, check English locale** for POI reference

3. **If POI exists in English, connect it to target language** using Strapi v5 relations API:
   ```javascript
   PUT /api/poi-recommendations/{documentId}?locale={target-locale}
   Body: {
     data: {
       poi: {
         connect: [poiDocumentId]
       }
     }
   }
   ```

### 🔧 TECHNICAL IMPROVEMENTS

#### API Usage
- ✅ **Strapi v5 Relations API**: Uses proper `connect` syntax for managing relations
- ✅ **Efficient Filtering**: Targets only items with null POI field using `filters[poi][$null]=true`
- ✅ **Better Query Performance**: Reduces API calls by pre-filtering results

#### Code Structure
- ✅ **New Function**: `fetchPoiRecommendationsWithNullPoi(locale)` for targeted queries
- ✅ **Updated Function**: `updatePoiRecommendation()` now uses relations connect syntax
- ✅ **Improved Logging**: Better progress indicators and error messages
- ✅ **Enhanced Documentation**: Comprehensive inline comments and usage examples

### 📚 REFERENCES

- **Strapi v5 Relations API**: https://docs.strapi.io/cms/api/rest/relations
- **Null Filtering**: `?filters[poi][$null]=true` for finding empty relations
- **Connect Syntax**: `{ poi: { connect: [documentId] } }` for linking relations

### 🚀 USAGE

#### Interactive Mode (Recommended)
```bash
node sync-poi-recommendation.js
```

#### Single Sync
```bash
node sync-poi-recommendation.js <poi-recommendation-documentId> <target-locale>
```

#### Batch Sync (NEW APPROACH)
```bash
node sync-poi-recommendation.js --batch=zh-Hant
```

### ✨ BENEFITS

1. **More Efficient**: Only processes items that actually need syncing
2. **Better Performance**: Fewer API calls due to targeted filtering
3. **Strapi v5 Compatible**: Uses latest relations API standards
4. **Improved UX**: Better progress tracking and error messages
5. **Future-Proof**: Built with Strapi v5 best practices

### 🔄 MIGRATION

No migration needed! The script is backward compatible and will work with existing data. The new approach simply makes the process more efficient and reliable.
