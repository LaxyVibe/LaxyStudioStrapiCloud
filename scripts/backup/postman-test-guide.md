# Postman API Testing Guide for Strapi v5

## Overview
This guide will help you test your Strapi API authentication and identify why the migration scripts are failing with 401 errors.

## Setup Instructions

### 1. Install Postman
- Download from: https://www.postman.com/downloads/
- Or use Postman web version

### 2. Create New Collection
1. Open Postman
2. Click "New" → "Collection"
3. Name it "Strapi v5 Migration Tests"

### 3. Set Collection Variables
1. Click on your collection
2. Go to "Variables" tab
3. Add these variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| baseUrl | https://laxy-studio-strapi-c1d6d20cbc41.herokuapp.com | https://laxy-studio-strapi-c1d6d20cbc41.herokuapp.com |
| apiToken | 89a1e8fd59f028d76a1bf5cac977635aa51e4fed079ac514cb50cb87a4110be8b82d09c642344abfcad6e24894a633d64ca0b8bd044b5a6f3ff422a990ac277f9363e30e7035d3537aad812e039ded4d4ceb616b872a69bcd0794f465a584a63c1ec750d363193a12abaabeb9176fe9a63edd471c6d24c86d9570a82001cb3b8 | 89a1e8fd59f028d76a1bf5cac977635aa51e4fed079ac514cb50cb87a4110be8b82d09c642344abfcad6e24894a633d64ca0b8bd044b5a6f3ff422a990ac277f9363e30e7035d3537aad812e039ded4d4ceb616b872a69bcd0794f465a584a63c1ec750d363193a12abaabeb9176fe9a63edd471c6d24c86d9570a82001cb3b8 |

## Test Requests

### Test 1: Basic GET Request (Should Work)
**Request**: `GET {{baseUrl}}/api/tag-labels`
**Headers**:
- `Authorization: Bearer {{apiToken}}`
- `Content-Type: application/json`

**Expected Result**: 200 OK with tag labels data

### Test 2: Create Tag Label (POST)
**Request**: `POST {{baseUrl}}/api/tag-labels`
**Headers**:
- `Authorization: Bearer {{apiToken}}`
- `Content-Type: application/json`

**Body** (JSON):
```json
{
  "data": {
    "label": "Test Tag",
    "slug": "test-tag",
    "locale": "en"
  }
}
```

**Expected Result**: 201 Created with new tag label

### Test 3: Create POI (POST)
**Request**: `POST {{baseUrl}}/api/pois`
**Headers**:
- `Authorization: Bearer {{apiToken}}`
- `Content-Type: application/json`

**Body** (JSON):
```json
{
  "data": {
    "name": "Test POI",
    "slug": "test-poi",
    "locale": "en",
    "publishedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Test 4: Check API Token Permissions
**Request**: `GET {{baseUrl}}/api/users/me`
**Headers**:
- `Authorization: Bearer {{apiToken}}`

**Expected Result**: Information about the API token's user/permissions

### Test 5: Check Content Types
**Request**: `GET {{baseUrl}}/api/content-type-builder/content-types`
**Headers**:
- `Authorization: Bearer {{apiToken}}`

## Common Issues & Solutions

### 401 Unauthorized
- **Token Invalid**: Regenerate API token in Strapi admin
- **Token Permissions**: Check token has Create/Update permissions
- **Header Format**: Ensure `Authorization: Bearer {token}` format
- **Token Type**: Ensure using API Token, not JWT token

### 403 Forbidden
- **Insufficient Permissions**: Token doesn't have required permissions
- **Content Type Access**: Token doesn't have access to specific content types

### Token Regeneration Steps
1. Login to Strapi admin: https://laxy-studio-strapi-c1d6d20cbc41.herokuapp.com/admin
2. Go to Settings → API Tokens
3. Delete existing token
4. Create new token with:
   - **Name**: Migration Token
   - **Description**: For data migration scripts
   - **Token duration**: Custom (set long duration)
   - **Token type**: Full access OR Custom with all CRUD permissions

## Debugging Steps

1. **Test GET first** - Verify token works for reading
2. **Test simple POST** - Try creating a simple tag label
3. **Check token permissions** - Verify full access or proper CRUD permissions
4. **Compare headers** - Ensure Postman and script use identical headers
5. **Check Strapi logs** - Look for detailed error messages in Heroku logs

## Headers Comparison

### Working curl command:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     https://laxy-studio-strapi-c1d6d20cbc41.herokuapp.com/api/tag-labels
```

### Migration script headers:
```javascript
headers: {
  'Authorization': `Bearer ${apiToken}`,
  'Content-Type': 'application/json'
}
```

Both should be identical. If Postman works but script doesn't, the issue is likely in how the script constructs requests.

## Next Steps After Testing

1. If Postman POST works → Issue is in migration script request construction
2. If Postman POST fails → Issue is with API token permissions
3. If both fail → Need to regenerate token with proper permissions
