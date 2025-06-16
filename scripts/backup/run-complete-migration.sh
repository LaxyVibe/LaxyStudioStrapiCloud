#!/bin/bash

# Complete Migration Script
# Run this after manually resetting the destination database

echo "🚀 Starting Complete 3-Step Migration Process..."
echo "=============================================="

cd "$(dirname "$0")"

# Step 0: Clean destination (optional, but recommended)
echo ""
echo "🧹 STEP 0: Cleaning destination..."
node step0-destination-cleaner.js
if [ $? -ne 0 ]; then
    echo "❌ Step 0 failed. Aborting migration."
    exit 1
fi

# Step 1: English content migration
echo ""
echo "🇺🇸 STEP 1: Migrating English content with enhanced documentId storage..."
node step1-en-content-migrator.js
if [ $? -ne 0 ]; then
    echo "❌ Step 1 failed. Aborting migration."
    exit 1
fi

# Step 2: Non-English localizations with media inheritance
echo ""
echo "🌐 STEP 2: Migrating localizations with media field inheritance..."
node step2-non-en-localizations-migrator.js
if [ $? -ne 0 ]; then
    echo "❌ Step 2 failed. Aborting migration."
    exit 1
fi

# Step 3: Relations migration with fixed API calls
echo ""
echo "🔗 STEP 3: Migrating relations with corrected documentId usage..."
node step3-relations-migrator.js
if [ $? -ne 0 ]; then
    echo "❌ Step 3 failed. Check the logs for details."
    exit 1
fi

echo ""
echo "🎉 COMPLETE MIGRATION SUCCESSFUL!"
echo "=================================="
echo "✅ All 3 steps completed successfully"
echo "📊 Check the results files for detailed statistics"
echo "🔍 Verify your content in the destination Strapi instance"
