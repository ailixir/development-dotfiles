#!/bin/bash

# PUT Checks Module - Development Setup Script
# This script initializes the development environment

set -e

echo "🏗️  Setting up PUT Checks Module..."

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
  echo "❌ Error: package.json not found. Please run this script from the project root."
  exit 1
fi

# Check Node.js version
node_version=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [[ $node_version -lt 18 ]]; then
  echo "❌ Error: Node.js 18+ is required. Current version: $(node -v)"
  exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if core-components exists
if [[ ! -d "../put-core-components" ]]; then
  echo "⚠️  Warning: @put/core-components not found at ../put-core-components"
  echo "   The sidebar will not work without the core components library."
  echo "   Please ensure the core-components library is built and available."
fi

# Initialize MSW
echo "🔧 Initializing Mock Service Worker..."
npm run msw:init

# Create environment file for development
if [[ ! -f ".env.development" ]]; then
  echo "🌍 Creating .env.development..."
  cat > .env.development << EOF
# Development Environment Configuration
VITE_APP_NAME=PUT Checks Module
VITE_NODE_ENV=development
VITE_API_BASE_URL=http://localhost:3002/api
VITE_ENABLE_MSW=true
VITE_MODULE_NAME=checks
VITE_MODULE_VERSION=1.0.0
VITE_DEBUG_MODE=true

# Also set for webpack builds
NODE_ENV=development
EOF
else
  echo "✅ .env.development already exists"
fi

# Run type checking to ensure everything is set up correctly
echo "🔍 Running type check..."
npm run type-check

echo ""
echo "🎉 Setup complete! You can now start development:"
echo ""
echo "   Standalone mode (Vite):     npm run dev"
echo "   Federated mode (Webpack):   npm run dev:fed"
echo ""
echo "📖 Documentation:"
echo "   Implementation Plan:        CHECKS_IMPLEMENTATION_PLAN.md"
echo "   Project Overview:           PRD.md"
echo "   Architecture:               ARCH.md"
echo ""
echo "🚀 Happy coding!"
