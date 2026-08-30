#!/bin/bash

# POLARISIS - Autonomous Maritime Navigation System
# Master Setup & Startup Script

set -e

echo "╔═════════════════════════════════════════════════╗"
echo "║        POLARISIS Development Environment      ║"
echo "║  Autonomous Maritime Navigation System         ║"
echo "╚═════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Python 3: $(python3 --version)"

# Check Node
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm: $(npm --version)"

echo ""
echo "📋 Setup Options:"
echo "  1) Full setup (backend + frontend)"
echo "  2) Backend only"
echo "  3) Frontend only"
echo "  4) Build C++ client"
echo "  5) Run Docker Compose"
echo "  6) Clean all"
echo ""

read -p "Select option (1-6): " choice

case $choice in
    1)
        echo -e "${BLUE}Installing backend dependencies...${NC}"
        cd backend
        if [ ! -d "venv" ]; then
            python3 -m venv venv
        fi
        source venv/bin/activate
        pip install -q -r requirements.txt
        cd ..
        
        echo -e "${BLUE}Installing frontend dependencies...${NC}"
        cd frontend
        npm install -q
        cd ..
        
        echo ""
        echo -e "${GREEN}✅ Setup complete!${NC}"
        echo ""
        echo "To start the system:"
        echo -e "  ${YELLOW}Terminal 1:${NC} cd backend && source venv/bin/activate && python -m uvicorn app.main:app --reload"
        echo -e "  ${YELLOW}Terminal 2:${NC} cd frontend && npm run dev"
        echo ""
        ;;
        
    2)
        echo -e "${BLUE}Installing backend dependencies...${NC}"
        cd backend
        if [ ! -d "venv" ]; then
            python3 -m venv venv
        fi
        source venv/bin/activate
        pip install -q -r requirements.txt
        cd ..
        
        echo ""
        echo -e "${GREEN}✅ Backend setup complete!${NC}"
        echo ""
        echo "To start backend:"
        echo -e "  ${YELLOW}cd backend${NC}"
        echo -e "  ${YELLOW}source venv/bin/activate${NC}"
        echo -e "  ${YELLOW}python -m uvicorn app.main:app --reload${NC}"
        echo ""
        ;;
        
    3)
        echo -e "${BLUE}Installing frontend dependencies...${NC}"
        cd frontend
        npm install -q
        cd ..
        
        echo ""
        echo -e "${GREEN}✅ Frontend setup complete!${NC}"
        echo ""
        echo "To start frontend:"
        echo -e "  ${YELLOW}cd frontend${NC}"
        echo -e "  ${YELLOW}npm run dev${NC}"
        echo ""
        ;;
        
    4)
        echo -e "${BLUE}Building C++ client...${NC}"
        bash build-cpp-client.sh
        ;;
        
    5)
        echo -e "${BLUE}Starting Docker Compose...${NC}"
        docker-compose up -d
        echo ""
        echo -e "${GREEN}✅ Services started!${NC}"
        echo "  Frontend: http://localhost:5173"
        echo "  Backend API: http://localhost:8000"
        echo ""
        docker-compose logs -f
        ;;
        
    6)
        echo -e "${YELLOW}Cleaning up...${NC}"
        rm -rf frontend/node_modules frontend/dist
        rm -rf backend/venv backend/__pycache__ backend/**/__pycache__
        rm -rf cpp-client/build
        rm -rf .pytest_cache
        echo -e "${GREEN}✅ Cleanup complete!${NC}"
        ;;
        
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

echo ""
