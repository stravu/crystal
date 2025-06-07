const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Checking Electron installation...');

// Find all electron installations in node_modules
function findElectronPaths(dir) {
  const results = [];
  
  try {
    // Check direct node_modules/electron
    const directPath = path.join(dir, 'node_modules', 'electron');
    if (fs.existsSync(directPath)) {
      results.push(directPath);
    }
    
    // Check pnpm store locations
    const pnpmPath = path.join(dir, 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmPath)) {
      const dirs = fs.readdirSync(pnpmPath);
      dirs.forEach(d => {
        if (d.startsWith('electron@')) {
          const electronPath = path.join(pnpmPath, d, 'node_modules', 'electron');
          if (fs.existsSync(electronPath)) {
            results.push(electronPath);
          }
        }
      });
    }
  } catch (e) {
    console.error('Error finding Electron paths:', e.message);
  }
  
  return results;
}

// Fix Electron installation
function fixElectronInstall(electronPath) {
  const pathFile = path.join(electronPath, 'path.txt');
  const distDir = path.join(electronPath, 'dist');
  
  if (!fs.existsSync(pathFile) || !fs.existsSync(distDir)) {
    console.log(`Fixing Electron installation at: ${electronPath}`);
    const installScript = path.join(electronPath, 'install.js');
    
    if (fs.existsSync(installScript)) {
      try {
        execSync(`node "${installScript}"`, { 
          cwd: electronPath,
          stdio: 'inherit'
        });
        console.log(`✓ Fixed Electron at: ${electronPath}`);
      } catch (e) {
        console.error(`Failed to fix Electron at ${electronPath}:`, e.message);
      }
    }
  } else {
    console.log(`✓ Electron already properly installed at: ${electronPath}`);
  }
}

// Main execution
const projectRoot = path.resolve(__dirname, '..');
const electronPaths = findElectronPaths(projectRoot);

if (electronPaths.length === 0) {
  console.error('No Electron installations found!');
  process.exit(1);
}

electronPaths.forEach(fixElectronInstall);

console.log('\nElectron installation check complete!');