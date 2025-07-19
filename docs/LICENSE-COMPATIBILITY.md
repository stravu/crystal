# License Compatibility Guide

Crystal is licensed under the MIT License, which is a permissive open-source license. This document explains our approach to dependency license compatibility.

## Compatible Licenses

The following licenses are compatible with MIT for use in Crystal:

### Permissive Licenses (Fully Compatible)
- **MIT**: Same as Crystal's license
- **Apache-2.0**: Permissive with patent grant
- **BSD** (2-clause, 3-clause): Permissive with attribution
- **ISC**: Simplified BSD-style license
- **CC0**: Public domain dedication
- **Unlicense**: Public domain
- **0BSD**: Zero-clause BSD

### Weak Copyleft Licenses (Compatible with Conditions)
- **LGPL-2.1, LGPL-3.0**: Compatible when used as dynamically linked libraries
- **MPL-2.0**: File-level copyleft, doesn't affect MIT code
- **EPL**: Similar to LGPL in practical terms

## Incompatible Licenses

The following licenses are **not** compatible with MIT distribution:

### Strong Copyleft Licenses
- **GPL-2.0, GPL-3.0** (without "or later" or dual licensing)
- **AGPL** (any version): Network copyleft
- **SSPL**: Server Side Public License

### Other Restrictive Licenses
- Proprietary licenses
- Custom licenses with distribution restrictions

## How We Check

The `check-license-compatibility.sh` script automatically validates that all dependencies use compatible licenses. It:

1. Checks for truly incompatible licenses (GPL, AGPL, SSPL)
2. Notes LGPL dependencies (compatible but worth tracking)
3. Summarizes all permissive licenses found

## LGPL Special Note

LGPL (Lesser GPL) dependencies are compatible with MIT when:
- They are used as libraries (not forked/modified)
- They are dynamically linked (which is the case for npm packages)
- We comply with LGPL requirements (providing source of the LGPL component)

The LGPL-3.0-or-later license specifically allows users to choose any later version of LGPL, providing additional flexibility.

## Current Status

Run `pnpm build:notices` to generate a current NOTICES file listing all dependency licenses.