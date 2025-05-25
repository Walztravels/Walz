#!/bin/bash

# Walz Travels Trip Planner - Deployment Verification Script
# Version: 7.0
# Date: 2024-12-19

BASE_URL="${1:-http://localhost:3001}"
echo "🔍 Verifying Walz Travels Trip Planner deployment at: $BASE_URL"
echo "=================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    echo -n "Testing $name... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$response" -eq "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC} ($response)"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (Expected: $expected_status, Got: $response)"
        return 1
    fi
}

# Test JSON response
test_json_endpoint() {
    local name="$1"
    local url="$2"
    
    echo -n "Testing $name... "
    
    response=$(curl -s "$url")
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$status" -eq 200 ] && echo "$response" | jq . > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC} (Valid JSON)"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (Status: $status)"
        return 1
    fi
}

# Counter for test results
TOTAL_TESTS=0
PASSED_TESTS=0

run_test() {
    ((TOTAL_TESTS++))
    if "$@"; then
        ((PASSED_TESTS++))
    fi
}

echo ""
echo "🏠 Testing Core Pages"
echo "--------------------"
run_test test_endpoint "Homepage" "$BASE_URL/"
run_test test_endpoint "Trip Planner" "$BASE_URL/trip-planner"
run_test test_endpoint "Sign In" "$BASE_URL/sign-in"
run_test test_endpoint "Sign Up" "$BASE_URL/sign-up"

echo ""
echo "🔧 Testing API Endpoints"
echo "------------------------"
run_test test_json_endpoint "Health Check" "$BASE_URL/api/health"
run_test test_json_endpoint "Test OpenAI" "$BASE_URL/api/test-openai"
run_test test_json_endpoint "Test Stripe" "$BASE_URL/api/test-stripe"

echo ""
echo "🔐 Testing Protected Routes (Should redirect)"
echo "--------------------------------------------"
run_test test_endpoint "Dashboard (Unauthenticated)" "$BASE_URL/dashboard" 307
run_test test_endpoint "Admin (Unauthenticated)" "$BASE_URL/admin" 307

echo ""
echo "📊 Testing Static Assets"
echo "------------------------"
run_test test_endpoint "Favicon" "$BASE_URL/favicon.ico"
run_test test_endpoint "Next.js Assets" "$BASE_URL/_next/static/media/logo.svg" 404

echo ""
echo "🚨 Testing Error Handling"
echo "-------------------------"
run_test test_endpoint "404 Page" "$BASE_URL/non-existent-page" 404

echo ""
echo "📈 Test Results Summary"
echo "======================="

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}✅ All tests passed! ($PASSED_TESTS/$TOTAL_TESTS)${NC}"
    echo ""
    echo "🎉 Deployment verification successful!"
    echo "   Your Walz Travels Trip Planner is ready for production!"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed ($PASSED_TESTS/$TOTAL_TESTS passed)${NC}"
    echo ""
    echo "🔧 Recommended actions:"
    echo "   1. Check environment variables"
    echo "   2. Verify API keys are valid"
    echo "   3. Ensure all dependencies are installed"
    echo "   4. Check server logs for errors"
    exit 1
fi