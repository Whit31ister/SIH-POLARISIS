#!/bin/bash

# POLARISIS Backend Development Server

echo "🚀 Starting POLARISIS Backend..."
echo "=================================="

cd backend

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -q -r requirements.txt

# Run FastAPI
echo "✅ Backend ready at http://localhost:8000"
echo "📖 API docs at http://localhost:8000/docs"
echo ""
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
