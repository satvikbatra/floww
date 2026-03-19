#!/bin/bash

# Floww Backend Setup Script
# This script will set up the TypeScript backend

set -e

echo "╔═══════════════════════════════════════╗"
echo "║   🚀 Floww Backend Setup              ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check Node.js version
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 20"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version must be >= 20 (found: $(node -v))"
    exit 1
fi

echo "✅ Node.js $(node -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Setup environment
if [ ! -f ".env" ]; then
    echo ""
    echo "🔧 Creating .env file..."
    cp .env.example .env
    
    # Generate random JWT secret
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    
    # Update .env with generated secret
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/your-super-secret-jwt-key-min-32-characters-long-change-this/$JWT_SECRET/" .env
    else
        # Linux
        sed -i "s/your-super-secret-jwt-key-min-32-characters-long-change-this/$JWT_SECRET/" .env
    fi
    
    echo "✅ Generated secure JWT_SECRET"
else
    echo "✅ .env file already exists"
fi

# Generate Prisma client
echo ""
echo "🗄️  Generating Prisma client..."
npm run db:generate

# Check if we should setup database
echo ""
read -p "📊 Do you want to setup the database now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔨 Setting up database..."
    npm run db:push
    echo "✅ Database schema created"
fi

# Done
echo ""
echo "╔═══════════════════════════════════════╗"
echo "║   ✨ Setup Complete!                  ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Edit .env if needed (database, ports, etc.)"
echo "  2. Run: npm run dev"
echo "  3. Visit: http://localhost:8000"
echo ""
echo "Happy coding! 🎉"
