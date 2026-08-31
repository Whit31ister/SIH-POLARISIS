#!/bin/bash

set -e

# Always run relative to the project root
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "🚀 Starting POLARISIS Backend..."
echo "=================================="

cd "$BACKEND_DIR"

# Make sure the virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Backend virtual environment not found."
    echo "Run ./setup.sh first."
    exit 1
fi

# Make sure Python is working
if [ ! -x "venv/bin/python" ]; then
    echo "❌ Backend Python executable not found."
    exit 1
fi

echo "🐍 Python:"
venv/bin/python --version

echo ""
echo "📡 Backend API:"
echo "http://localhost:8000"

echo ""
echo "📚 API documentation:"
echo "http://localhost:8000/docs"

echo ""
echo "❤️ Health check:"
echo "http://localhost:8000/health"

echo ""
echo "=================================="

exec venv/bin/python -m uvicorn app.main:app --reload