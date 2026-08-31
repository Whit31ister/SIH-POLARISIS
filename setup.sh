#!/bin/bash

# POLARISIS - Autonomous Maritime Navigation System
# Master Setup & Startup Script

set -e

# ============================================================
# Configuration
# ============================================================

# Python version to use for POLARISIS
PYTHON_BIN="python3.12"

# Backend virtual environment
BACKEND_VENV="backend/venv"

# ============================================================
# Colors
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================
# Helper functions
# ============================================================

error_exit() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}$1${NC}"
}

success() {
    echo -e "${GREEN}$1${NC}"
}

warning() {
    echo -e "${YELLOW}$1${NC}"
}

# ============================================================
# Check Python 3.12
# ============================================================

check_python() {
    echo "🔍 Checking prerequisites..."
    echo ""

    if ! command -v "$PYTHON_BIN" &> /dev/null; then
        error_exit "Python 3.12 is not installed or not available as '$PYTHON_BIN'."
    fi

    PYTHON_VERSION=$("$PYTHON_BIN" --version 2>&1)

    if ! "$PYTHON_BIN" -c "import sys; assert sys.version_info[:2] == (3, 12)" &> /dev/null; then
        error_exit "$PYTHON_BIN exists, but it is not Python 3.12."
    fi

    success "✓ Python: $PYTHON_VERSION"

    # Check that the venv module is available
    if ! "$PYTHON_BIN" -c "import venv" &> /dev/null; then
        error_exit "Python 3.12 venv module is missing. Install the Python 3.12 venv package."
    fi
}

# ============================================================
# Check Node.js
# ============================================================

check_node() {
    if ! command -v node &> /dev/null; then
        error_exit "Node.js is not installed."
    fi

    success "✓ Node.js: $(node --version)"
}

# ============================================================
# Check npm
# ============================================================

check_npm() {
    if ! command -v npm &> /dev/null; then
        error_exit "npm is not installed."
    fi

    success "✓ npm: $(npm --version)"
}

# ============================================================
# Create / validate backend virtual environment
# ============================================================

setup_backend_venv() {
    info "Configuring Python 3.12 virtual environment..."

    # If venv doesn't exist, create it with Python 3.12
    if [ ! -d "$BACKEND_VENV" ]; then
        echo "Creating Python 3.12 virtual environment..."

        "$PYTHON_BIN" -m venv "$BACKEND_VENV"
    fi

    # Verify that the venv has a Python executable
    if [ ! -x "$BACKEND_VENV/bin/python" ]; then
        warning "Existing virtual environment is invalid. Recreating..."

        rm -rf "$BACKEND_VENV"

        "$PYTHON_BIN" -m venv "$BACKEND_VENV"
    fi

    # Verify the venv is actually Python 3.12
    VENV_VERSION=$("$BACKEND_VENV/bin/python" --version 2>&1)

    if ! "$BACKEND_VENV/bin/python" -c "import sys; assert sys.version_info[:2] == (3, 12)" &> /dev/null; then
        warning "Existing virtual environment uses the wrong Python version."
        echo "Found: $VENV_VERSION"
        echo "Expected: Python 3.12.x"
        echo ""
        echo "Recreating virtual environment..."

        rm -rf "$BACKEND_VENV"

        "$PYTHON_BIN" -m venv "$BACKEND_VENV"
    fi

    # Final verification
    if ! "$BACKEND_VENV/bin/python" -c "import sys; assert sys.version_info[:2] == (3, 12)" &> /dev/null; then
        error_exit "Failed to create a Python 3.12 virtual environment."
    fi

    # Check pip inside the venv
    if ! "$BACKEND_VENV/bin/python" -m pip --version &> /dev/null; then
        error_exit "pip is missing from the Python 3.12 virtual environment."
    fi

    success "✓ Backend Python: $("$BACKEND_VENV/bin/python" --version)"
    success "✓ Backend pip: $("$BACKEND_VENV/bin/python" -m pip --version | cut -d' ' -f1-2)"

    echo ""
}

# ============================================================
# Install backend dependencies
# ============================================================

install_backend() {
    info "Installing backend dependencies..."

    setup_backend_venv

    echo "Using Python:"
    "$BACKEND_VENV/bin/python" --version

    echo ""

    echo "Upgrading pip..."
    "$BACKEND_VENV/bin/python" -m pip install --upgrade pip

    echo ""

    echo "Installing requirements..."
    "$BACKEND_VENV/bin/python" -m pip install -r backend/requirements.txt

    echo ""

    success "✓ Backend dependencies installed"
}

# ============================================================
# Install frontend dependencies
# ============================================================

install_frontend() {
    info "Installing frontend dependencies..."

    cd frontend

    npm install

    cd ..

    echo ""

    success "✓ Frontend dependencies installed"
}

# ============================================================
# Docker Compose detection
# ============================================================

get_docker_compose_command() {
    if command -v docker &> /dev/null && docker compose version &> /dev/null; then
        echo "docker compose"
        return
    fi

    if command -v docker-compose &> /dev/null; then
        echo "docker-compose"
        return
    fi

    return 1
}

# ============================================================
# Main prerequisite checks
# ============================================================

check_python
check_node
check_npm

echo ""

# ============================================================
# Menu
# ============================================================

echo "📋 Setup Options:"
echo "  1) Full setup (backend + frontend)"
echo "  2) Backend only"
echo "  3) Frontend only"
echo "  4) Build C++ client"
echo "  5) Run Docker Compose"
echo "  6) Clean all"
echo ""

read -p "Select option (1-6): " choice

echo ""

# ============================================================
# Options
# ============================================================

case "$choice" in

    # --------------------------------------------------------
    # 1) Full setup
    # --------------------------------------------------------

    1)
        install_backend

        install_frontend

        echo ""
        success "✅ Setup complete!"
        echo ""

        echo "Environment:"
        echo -e "  ${GREEN}Python:${NC} $("$BACKEND_VENV/bin/python" --version)"
        echo -e "  ${GREEN}Backend:${NC} $BACKEND_VENV"
        echo -e "  ${GREEN}Node:${NC} $(node --version)"
        echo ""

        echo "To start the system:"
        echo ""

        echo -e "  ${YELLOW}Terminal 1:${NC}"
        echo "  cd backend && venv/bin/python -m uvicorn app.main:app --reload"
        echo ""

        echo -e "  ${YELLOW}Terminal 2:${NC}"
        echo "  cd frontend && npm run dev"
        echo ""

        ;;

    # --------------------------------------------------------
    # 2) Backend only
    # --------------------------------------------------------

    2)
        install_backend

        echo ""
        success "✅ Backend setup complete!"
        echo ""

        echo "Backend Python:"
        echo -e "  ${GREEN}$("$BACKEND_VENV/bin/python" --version)${NC}"
        echo ""

        echo "To start backend:"
        echo -e "  ${YELLOW}cd backend${NC}"
        echo -e "  ${YELLOW}venv/bin/python -m uvicorn app.main:app --reload${NC}"
        echo ""

        ;;

    # --------------------------------------------------------
    # 3) Frontend only
    # --------------------------------------------------------

    3)
        install_frontend

        echo ""
        success "✅ Frontend setup complete!"
        echo ""

        echo "To start frontend:"
        echo -e "  ${YELLOW}cd frontend${NC}"
        echo -e "  ${YELLOW}npm run dev${NC}"
        echo ""

        ;;

    # --------------------------------------------------------
    # 4) Build C++ client
    # --------------------------------------------------------

    4)
        info "Building C++ client..."

        if [ ! -f "build-cpp-client.sh" ]; then
            error_exit "build-cpp-client.sh not found."
        fi

        bash build-cpp-client.sh

        echo ""
        success "✅ C++ client build complete!"
        echo ""

        ;;

    # --------------------------------------------------------
    # 5) Docker Compose
    # --------------------------------------------------------

    5)
        info "Starting Docker Compose..."

        COMPOSE_CMD=$(get_docker_compose_command) || {
            error_exit "Docker Compose is not installed. Install Docker with Compose support first."
        }

        echo "Using: $COMPOSE_CMD"
        echo ""

        $COMPOSE_CMD up -d

        echo ""
        success "✅ Services started!"
        echo ""

        echo "Frontend: http://localhost:5173"
        echo "Backend API: http://localhost:8000"
        echo ""

        $COMPOSE_CMD logs -f

        ;;

    # --------------------------------------------------------
    # 6) Clean all
    # --------------------------------------------------------

    6)
        warning "Cleaning up..."

        # Frontend
        rm -rf frontend/node_modules
        rm -rf frontend/dist

        # Backend
        rm -rf backend/venv
        find backend -type d -name "__pycache__" -prune -exec rm -rf {} +
        find backend -type d -name ".pytest_cache" -prune -exec rm -rf {} +

        # C++
        rm -rf cpp-client/build

        # Root pytest cache
        rm -rf .pytest_cache

        success "✅ Cleanup complete!"
        echo ""

        ;;

    # --------------------------------------------------------
    # Invalid option
    # --------------------------------------------------------

    *)
        error_exit "Invalid option. Please select a number from 1 to 6."
        ;;

esac

echo ""