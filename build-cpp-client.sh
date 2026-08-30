#!/bin/bash

# POLARISIS C++ Client Build Script

echo "🔨 Building POLARISIS C++ Client..."
echo "===================================="

cd cpp-client

# Create build directory
mkdir -p build
cd build

# Check for CMake
if ! command -v cmake &> /dev/null; then
    echo "❌ CMake is not installed. Please install CMake first."
    echo "   Ubuntu: sudo apt-get install cmake"
    echo "   macOS: brew install cmake"
    exit 1
fi

# Check for required libraries
if ! pkg-config --exists libcurl; then
    echo "❌ libcurl is not installed. Please install libcurl first."
    echo "   Ubuntu: sudo apt-get install libcurl4-openssl-dev"
    echo "   macOS: brew install curl"
    exit 1
fi

if ! pkg-config --exists jsoncpp; then
    echo "❌ jsoncpp is not installed. Please install jsoncpp first."
    echo "   Ubuntu: sudo apt-get install libjsoncpp-dev"
    echo "   macOS: brew install jsoncpp"
    exit 1
fi

# Build
cmake ..
make

if [ -f "polarisis-client" ]; then
    echo "✅ Build successful!"
    echo "📍 Binary location: cpp-client/build/polarisis-client"
    echo ""
    echo "To run the client:"
    echo "   ./polarisis-client"
else
    echo "❌ Build failed!"
    exit 1
fi
