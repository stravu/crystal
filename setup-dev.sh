#!/bin/bash

# Development environment setup script for Crystal

echo "🔧 Setting up Crystal development environment..."

# Check if homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew is required. Please install from https://brew.sh"
    exit 1
fi

# Ensure python-setuptools is installed (fixes distutils issue)
if ! brew list python-setuptools &> /dev/null; then
    echo "📦 Installing python-setuptools..."
    brew install python-setuptools
fi

# Check Node version
NODE_VERSION=$(node -v)
echo "📌 Using Node.js $NODE_VERSION"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

# Run the setup
echo "🚀 Running pnpm setup..."
pnpm -w run setup

echo "✅ Setup complete! You can now run 'pnpm dev' to start the application."