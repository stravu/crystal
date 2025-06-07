#!/bin/bash

echo "🚀 Installing Crystal - Claude Code Manager"
echo "==========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

# Check prerequisites
echo "Checking prerequisites..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 22+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    print_warning "Node.js version is $NODE_VERSION. Recommended: 22+ for best compatibility with Electron."
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    print_error "pnpm is not installed. Please install with: npm install -g pnpm"
    exit 1
fi

print_step "Prerequisites check passed"

# Install dependencies
echo ""
echo "Installing dependencies..."
if pnpm install; then
    print_step "Dependencies installed"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Fix Electron and rebuild native modules
echo ""
echo "Fixing Electron installation and rebuilding native modules..."

# Run the fix script
if node scripts/fix-electron-install.js; then
    print_step "Electron installation fixed"
else
    print_warning "Automatic fix failed, trying manual approach..."
    
    # Manual rebuild approaches
    echo "Rebuilding native modules manually..."
    
    # Approach 1: Standard rebuild
    if npx electron-rebuild -f; then
        print_step "Native modules rebuilt successfully"
    else
        print_warning "Standard rebuild failed, trying alternative approaches..."
        
        # Approach 2: Rebuild specific modules
        if find node_modules -name "better-sqlite3" -type d -exec npx electron-rebuild -f -m {} \; 2>/dev/null; then
            print_step "better-sqlite3 rebuilt successfully"
        else
            # Approach 3: Manual compilation in pnpm store
            print_warning "Trying manual compilation in pnpm store..."
            
            SQLITE_PATH="node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3"
            if [ -d "$SQLITE_PATH" ]; then
                cd "$SQLITE_PATH"
                if npm run install 2>/dev/null || node-gyp rebuild --runtime=electron --target=36.4.0 --arch=$(uname -m) 2>/dev/null; then
                    cd - > /dev/null
                    print_step "Manual compilation successful"
                else
                    cd - > /dev/null
                    print_error "Manual compilation failed"
                fi
            fi
        fi
    fi
fi

echo ""
echo "Installation complete! 🎉"
echo ""
echo "To run the application:"
echo "  npm run dev"
echo ""
echo "If you encounter issues, try:"
echo "  node scripts/fix-electron-install.js"
echo "  npx electron-rebuild -f"