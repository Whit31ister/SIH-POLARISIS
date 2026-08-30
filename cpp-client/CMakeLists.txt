cmake_minimum_required(VERSION 3.10)
project(PolarisisClient)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(CURL REQUIRED)
find_package(jsoncpp REQUIRED)

# Add the executable
add_executable(polarisis-client main.cpp)

# Link libraries
target_link_libraries(polarisis-client PRIVATE CURL::libcurl jsoncpp)

# Installation
install(TARGETS polarisis-client DESTINATION bin)
