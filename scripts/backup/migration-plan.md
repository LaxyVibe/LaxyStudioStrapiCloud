# Strapi Content Migration Plan: Cloud to Heroku

## Overview
Migrate all content from Strapi Cloud to Heroku-hosted Strapi using API calls.

## Migration Phases

### Phase 1: Schema Analysis
1. **Export Content Types Schema**
   - Extract all content types from source (Cloud)
   - Compare with destination (Heroku) schema
   - Identify differences and required adjustments

2. **Content Audit**
   - List all content types and their entry counts
   - Identify media files and their usage
   - Map relationships between content types

### Phase 2: Media Migration
1. **Download Media Files**
   - Fetch all media metadata from source
   - Download actual files from Cloudinary/source
   - Upload files to destination media library

### Phase 3: Content Migration
1. **Export Content Data**
   - Extract all entries for each content type
   - Preserve relationships and references
   - Handle draft vs published states

2. **Import Content Data**
   - Create entries in destination
   - Rebuild relationships
   - Set proper publication states

### Phase 4: Verification
1. **Data Integrity Check**
   - Compare entry counts
   - Verify relationships
   - Test media accessibility

## Migration Order (by dependencies)
1. Media files (no dependencies)
2. Single types (admin, global settings)
3. Collection types without relations
4. Collection types with self-relations
5. Collection types with cross-relations
6. Update all relationships

## Tools Required
- Node.js scripts for API calls
- Progress tracking and logging
- Error handling and retry logic
- Data validation utilities
