#!/bin/bash

# Walz Travels Trip Planner - Production Deployment Script
# Version: 7.0
# Date: 2024-12-19

set -e

echo "🚀 Starting Walz Travels Trip Planner Production Deployment..."

# Environment setup
export NODE_ENV=production
echo "✅ Environment set to production"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf .next
rm -rf node_modules/.cache

# Install dependencies with Bun
echo "📦 Installing production dependencies..."
bun install --production

# Build the application
echo "🔨 Building application for production..."
bun run build

# Verify build
if [ ! -d ".next" ]; then
    echo "❌ Build failed - .next directory not found"
    exit 1
fi

echo "✅ Build completed successfully"

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf walz-travels-production.tar.gz .next netlify.toml package.json

# Verify package
if [ ! -f "walz-travels-production.tar.gz" ]; then
    echo "❌ Deployment package creation failed"
    exit 1
fi

echo "✅ Deployment package created: walz-travels-production.tar.gz"

# Display deployment information
echo ""
echo "🎉 Deployment package ready!"
echo "   File: walz-travels-production.tar.gz"
echo "   Size: $(du -h walz-travels-production.tar.gz | cut -f1)"
echo ""
echo "📋 Deployment Instructions:"
echo "   1. Upload walz-travels-production.tar.gz to Netlify"
echo "   2. Configure environment variables from .env.production"
echo "   3. Set custom domain: walzplanner.com"
echo "   4. Enable Netlify Functions for API routes"
echo ""
echo "🔧 Environment Variables to configure in Netlify:"
echo "   - All variables from .env.production"
echo "   - Ensure NEXT_PUBLIC_DOMAIN=https://walzplanner.com"
echo "   - Ensure NEXT_PUBLIC_API_URL=https://walzplanner.com/api"
echo ""
echo "✅ Ready for production deployment!"