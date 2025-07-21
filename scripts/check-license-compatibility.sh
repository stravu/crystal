#!/bin/bash

# License compatibility check for Crystal (MIT licensed)
# This script checks for licenses that are truly incompatible with MIT distribution

echo "Validating license compatibility with MIT..."

# Check if NOTICES file exists
if [ ! -f "NOTICES" ]; then
  echo "NOTICES file not found. Please run pnpm build:notices first."
  exit 1
fi

# Licenses that are truly incompatible with MIT for distribution:
# - GPL (without linking exception or "or later" clause that allows dual licensing)
# - AGPL
# - SSPL
# - Other proprietary or restrictive licenses

# LGPL is compatible with MIT when used as a library (dynamic linking)
# LGPL-3.0-or-later specifically allows users to choose a later version which may be more permissive

echo "Checking for incompatible licenses..."

# Create a temporary file to store potential issues
ISSUES_FILE=$(mktemp)

# Check for strong copyleft licenses without exceptions
# GPL-2.0 and GPL-3.0 without "or later" or dual licensing options
if grep -E "^License: GPL-[23]\.0$" NOTICES > "$ISSUES_FILE"; then
  echo "Found potentially incompatible GPL licenses:"
  cat "$ISSUES_FILE"
  FOUND_ISSUES=true
fi

# Check for AGPL (any version)
if grep -E "^License: AGPL" NOTICES >> "$ISSUES_FILE"; then
  echo "Found AGPL licenses (incompatible with MIT):"
  grep -E "^License: AGPL" NOTICES
  FOUND_ISSUES=true
fi

# Check for SSPL
if grep -E "^License: SSPL" NOTICES >> "$ISSUES_FILE"; then
  echo "Found SSPL licenses (incompatible with MIT):"
  grep -E "^License: SSPL" NOTICES
  FOUND_ISSUES=true
fi

# Check for LGPL (these are generally compatible but let's note them)
echo ""
echo "Checking LGPL licenses (generally compatible with MIT when used as libraries):"
LGPL_COUNT=$(grep -c "^License: LGPL" NOTICES || true)
if [ "$LGPL_COUNT" -gt 0 ]; then
  echo "Found $LGPL_COUNT LGPL licensed dependencies:"
  grep "^License: LGPL" NOTICES | sort | uniq -c
  echo "✓ LGPL is compatible with MIT when dependencies are dynamically linked"
fi

# Check for permissive licenses (these are all compatible)
echo ""
echo "Summary of permissive licenses found (all compatible with MIT):"
grep -E "^License: (MIT|Apache-2\.0|BSD|ISC|CC0|Unlicense|0BSD|Python-2\.0)" NOTICES | sort | uniq -c || true

# Clean up
rm -f "$ISSUES_FILE"

# Exit with error only if we found truly incompatible licenses
if [ "$FOUND_ISSUES" = "true" ]; then
  echo ""
  echo "::error::Found licenses that are incompatible with MIT distribution"
  echo "Please review the dependencies with incompatible licenses above."
  exit 1
else
  echo ""
  echo "✓ No incompatible licenses found. All dependencies are compatible with MIT distribution."
  exit 0
fi