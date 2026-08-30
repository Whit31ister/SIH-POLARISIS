#!/bin/bash

# POLARISIS Frontend Development Server

echo "🚀 Starting POLARISIS Frontend..."
echo "=================================="

cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run Vite dev server
echo "✅ Frontend ready at http://localhost:5173"
echo ""
npm run dev
