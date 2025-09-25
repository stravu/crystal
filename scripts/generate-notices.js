#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Generate optimized NOTICES file for Crystal application
 * This script collects third-party licenses that require attribution and groups them by license type
 */

const NOTICES_HEADER = `THIRD-PARTY SOFTWARE NOTICES AND INFORMATION
============================================

Crystal includes third-party software components. The following notices and license terms apply to various components distributed with Crystal.

This file includes only packages with licenses that require attribution. Public domain and no-attribution licenses (0BSD, WTFPL, Unlicense) have been excluded.

`;

// Dev-only packages that aren't distributed with the built app
const DEV_ONLY_PACKAGES = [
  '@eslint/',
  '@playwright/',
  '@types/',
  '@typescript-eslint/',
  '@vitejs/',
  'autoprefixer',
  'concurrently',
  'electron-builder',
  'electron-rebuild',
  'eslint',
  'globals',
  'mkdirp',
  'playwright',
  'postcss',
  'rimraf',
  'tailwindcss',
  'typescript',
  'typescript-eslint',
  'vite',
  'wait-on'
];

// Licenses that don't require attribution
const NO_ATTRIBUTION_LICENSES = [
  '0BSD',
  'WTFPL',
  'Unlicense',
  'CC0-1.0',
  'CC-PDDC'
];

function isDevOnlyPackage(packageName) {
  return DEV_ONLY_PACKAGES.some(devPkg => 
    packageName === devPkg || packageName.startsWith(devPkg)
  );
}

function requiresAttribution(licenseType) {
  if (!licenseType) return true; // Include if unknown
  
  const normalizedLicense = licenseType.toUpperCase();
  
  // Check for no-attribution licenses
  for (const noAttrLicense of NO_ATTRIBUTION_LICENSES) {
    if (normalizedLicense.includes(noAttrLicense)) {
      return false;
    }
  }
  
  // For dual licenses (e.g., "WTFPL OR MIT"), check if ANY requires attribution
  if (normalizedLicense.includes(' OR ')) {
    const licenses = normalizedLicense.split(' OR ');
    return licenses.some(license => {
      const trimmed = license.trim();
      return !NO_ATTRIBUTION_LICENSES.includes(trimmed) && 
             !NO_ATTRIBUTION_LICENSES.some(noAttr => trimmed.includes(noAttr));
    });
  }
  
  return true;
}

function getLicenseInfo(packagePath) {
  const licenseFiles = [
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'license',
    'license.md',
    'license.txt',
    'LICENCE',
    'LICENCE.md',
    'LICENCE.txt',
    'LICENSE-MIT',
    'LICENSE.MIT',
    'COPYING',
    'COPYING.txt'
  ];

  let licenseText = null;
  let licenseType = null;

  // Try to find a license file
  for (const file of licenseFiles) {
    const licensePath = path.join(packagePath, file);
    if (fs.existsSync(licensePath)) {
      licenseText = fs.readFileSync(licensePath, 'utf8').trim();
      break;
    }
  }

  // Check in package.json for license field
  const packageJsonPath = path.join(packagePath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Get license type
      licenseType = packageJson.license;
      
      // Sometimes license text is embedded in package.json
      if (!licenseText && packageJson.licenseText) {
        licenseText = packageJson.licenseText;
      }
      
      // If no license text found, use the license field
      if (!licenseText && licenseType) {
        licenseText = `License: ${licenseType}`;
      }
    } catch (e) {
      console.warn(`Error reading package.json for ${packagePath}: ${e.message}`);
    }
  }

  return { licenseText, licenseType };
}

function getPackageInfo(packagePath) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return {
        name: packageJson.name,
        version: packageJson.version,
        author: packageJson.author,
        homepage: packageJson.homepage,
        repository: packageJson.repository,
        license: packageJson.license
      };
    } catch (e) {
      return null;
    }
  }
  return null;
}

function collectPackagesFromNodeModules(nodeModulesPath, licenses, processedPaths) {
  if (!fs.existsSync(nodeModulesPath)) return;

  const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    // Skip pnpm internal directories
    if (entry.name === '.pnpm' || entry.name === '.bin' || entry.name.startsWith('.')) continue;
    
    const fullPath = path.join(nodeModulesPath, entry.name);
    
    // Handle scoped packages
    if (entry.name.startsWith('@')) {
      const scopedEntries = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const scopedEntry of scopedEntries) {
        if (scopedEntry.isDirectory()) {
          const scopedPackagePath = path.join(fullPath, scopedEntry.name);
          processPackage(scopedPackagePath, `${entry.name}/${scopedEntry.name}`, licenses, processedPaths);
        }
      }
    } else {
      processPackage(fullPath, entry.name, licenses, processedPaths);
    }
  }
  
  // For pnpm, also check the .pnpm directory
  const pnpmPath = path.join(nodeModulesPath, '.pnpm');
  if (fs.existsSync(pnpmPath)) {
    collectPackagesFromPnpm(pnpmPath, licenses, processedPaths);
  }
}

function collectPackagesFromPnpm(pnpmPath, licenses, processedPaths) {
  const entries = fs.readdirSync(pnpmPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    // pnpm stores packages as package@version format
    // Handle scoped packages like @org+package@version
    const scopedMatch = entry.name.match(/^(.+)\+(.+)@(.+)$/);
    const regularMatch = entry.name.match(/^([^@]+)@(.+)$/);
    
    let packageName;
    if (scopedMatch) {
      // Scoped package: convert @org+package to @org/package
      packageName = `${scopedMatch[1]}/${scopedMatch[2]}`;
    } else if (regularMatch) {
      // Regular package
      packageName = regularMatch[1];
    } else {
      continue;
    }
    
    const fullPath = path.join(pnpmPath, entry.name, 'node_modules', packageName);
    
    if (fs.existsSync(fullPath)) {
      processPackage(fullPath, packageName, licenses, processedPaths);
    }
  }
}

function processPackage(packagePath, packageName, licenses, processedPaths) {
  // Skip if already processed
  if (processedPaths.has(packagePath)) return;
  processedPaths.add(packagePath);
  
  // Skip dev-only packages
  if (isDevOnlyPackage(packageName)) return;
  
  const packageInfo = getPackageInfo(packagePath);
  if (!packageInfo) return;
  
  // Skip packages that don't require attribution
  if (!requiresAttribution(packageInfo.license)) {
    return;
  }
  
  const key = `${packageInfo.name}@${packageInfo.version}`;
  
  // Skip if we already have this exact version
  if (licenses.has(key)) return;
  
  
  const { licenseText, licenseType } = getLicenseInfo(packagePath);
  if (licenseText) {
    licenses.set(key, {
      name: packageInfo.name,
      version: packageInfo.version,
      author: packageInfo.author,
      homepage: packageInfo.homepage,
      repository: packageInfo.repository,
      licenseText: licenseText,
      licenseType: licenseType || packageInfo.license || 'Unknown'
    });
  } else {
    console.warn(`No license found for: ${key}`);
  }
}

function collectAllLicenses() {
  console.log('Collecting third-party licenses that require attribution...');
  
  const licenses = new Map();
  const processedPaths = new Set();
  const rootDir = path.join(__dirname, '..');
  
  // Collect from all possible node_modules locations
  const nodeModulesPaths = [
    path.join(rootDir, 'node_modules'),
    path.join(rootDir, 'frontend', 'node_modules'),
    path.join(rootDir, 'main', 'node_modules')
  ];
  
  for (const nodeModulesPath of nodeModulesPaths) {
    collectPackagesFromNodeModules(nodeModulesPath, licenses, processedPaths);
  }
  
  return licenses;
}

function formatLicenseEntry(info) {
  let entry = `Package: ${info.name}\n`;
  entry += `Version: ${info.version}\n`;
  
  if (info.author) {
    const author = typeof info.author === 'object' ? info.author.name : info.author;
    if (author) entry += `Author: ${author}\n`;
  }
  
  if (info.homepage) {
    entry += `Homepage: ${info.homepage}\n`;
  } else if (info.repository) {
    const repo = typeof info.repository === 'object' ? info.repository.url : info.repository;
    if (repo) entry += `Repository: ${repo}\n`;
  }
  
  entry += `\n${info.licenseText}\n`;
  
  return entry;
}

function groupLicensesByType(licenses) {
  const grouped = new Map();
  
  for (const [key, info] of licenses.entries()) {
    const licenseType = info.licenseType || 'Unknown';
    if (!grouped.has(licenseType)) {
      grouped.set(licenseType, []);
    }
    grouped.get(licenseType).push({ key, info });
  }
  
  return grouped;
}

function generateNotices() {
  const licenses = collectAllLicenses();
  const groupedLicenses = groupLicensesByType(licenses);
  
  let notices = NOTICES_HEADER;
  
  // Sort license types by frequency (most common first)
  const sortedLicenseTypes = Array.from(groupedLicenses.entries())
    .sort(([aType, aPackages], [bType, bPackages]) => {
      // MIT first, then by package count, then alphabetically
      if (aType === 'MIT') return -1;
      if (bType === 'MIT') return 1;
      const countDiff = bPackages.length - aPackages.length;
      if (countDiff !== 0) return countDiff;
      return aType.localeCompare(bType);
    });
  
  let totalPackages = 0;
  
  for (const [licenseType, packages] of sortedLicenseTypes) {
    notices += `================================================================================\n`;
    notices += `## ${licenseType} LICENSE\n`;
    notices += `================================================================================\n\n`;
    
    // Sort packages within each license type alphabetically
    packages.sort((a, b) => a.info.name.toLowerCase().localeCompare(b.info.name.toLowerCase()));
    
    // For common licenses, list all packages first, then include the license text once
    if (licenseType === 'MIT' || licenseType === 'ISC' || licenseType === 'BSD-2-Clause' || licenseType === 'Apache-2.0') {
      notices += `The following packages are licensed under the ${licenseType} license:\n\n`;
      
      for (const { info } of packages) {
        notices += `  - ${info.name} (${info.version})`;
        if (info.author) {
          const author = typeof info.author === 'object' ? info.author.name : info.author;
          if (author) notices += ` - ${author}`;
        }
        notices += '\n';
      }
      
      notices += '\n';
      
      // Include the license text once (from the first package)
      const firstPackage = packages[0];
      if (firstPackage && firstPackage.info.licenseText && !firstPackage.info.licenseText.startsWith('License:')) {
        notices += firstPackage.info.licenseText;
        notices += '\n\n';
      }
    } else {
      // For less common licenses, include full details for each package
      for (const { info } of packages) {
        notices += formatLicenseEntry(info);
        notices += '\n--------------------------------------------------------------------------------\n\n';
      }
    }
    
    totalPackages += packages.length;
  }
  
  // Add Crystal's own license
  const crystalPackageJson = require('../package.json');
  notices += `================================================================================\n`;
  notices += `## CRYSTAL LICENSE\n`;
  notices += `================================================================================\n\n`;
  notices += `Package: Crystal\n`;
  notices += `Version: ${crystalPackageJson.version}\n`;
  notices += `Author: ${crystalPackageJson.author}\n`;
  notices += `License: ${crystalPackageJson.license}\n`;
  notices += `\n${fs.readFileSync(path.join(__dirname, '..', 'LICENSE'), 'utf8')}\n`;
  
  return { notices, totalPackages: totalPackages + 1 };
}

function main() {
  try {
    const { notices, totalPackages } = generateNotices();
    const outputPath = path.join(__dirname, '..', 'NOTICES');
    
    fs.writeFileSync(outputPath, notices);
    console.log(`\nNOTICES file generated successfully at: ${outputPath}`);
    
    console.log(`Total packages included: ${totalPackages}`);
    
    // Verify file was created and show size reduction
    const stats = fs.statSync(outputPath);
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // Compare with original if it exists
    const originalPath = path.join(__dirname, '..', 'NOTICES.original');
    if (fs.existsSync(originalPath)) {
      const originalStats = fs.statSync(originalPath);
      const reduction = ((1 - stats.size / originalStats.size) * 100).toFixed(1);
      console.log(`Size reduction: ${reduction}% (from ${(originalStats.size / 1024).toFixed(2)} KB)`);
    }
  } catch (error) {
    console.error('Error generating NOTICES file:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateNotices };