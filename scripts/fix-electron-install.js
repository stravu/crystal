const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing Electron and native module installation...');

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
    console.log(`🔧 Fixing Electron installation at: ${electronPath}`);
    const installScript = path.join(electronPath, 'install.js');
    
    if (fs.existsSync(installScript)) {
      try {
        execSync(`node "${installScript}"`, { 
          cwd: electronPath,
          stdio: 'inherit'
        });
        console.log(`✅ Fixed Electron at: ${electronPath}`);
      } catch (e) {
        console.error(`❌ Failed to fix Electron at ${electronPath}:`, e.message);
      }
    }
  } else {
    console.log(`✅ Electron already properly installed at: ${electronPath}`);
  }
}

// Find and rebuild better-sqlite3 in pnpm structure
function rebuildBetterSqlite3() {
  const projectRoot = path.resolve(__dirname, '..');
  
  try {
    console.log('🔧 Rebuilding better-sqlite3 for Electron...');
    
    // Try multiple rebuild approaches
    const commands = [
      // Standard electron-rebuild
      'npx electron-rebuild -f -w better-sqlite3',
      // Force rebuild with module-dir for pnpm
      'npx electron-rebuild -f --module-dir node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3',
      // Manual rebuild of better-sqlite3 in pnpm location
      'cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npm run rebuild || npm run install || node-gyp rebuild --runtime=electron --target=36.4.0 --arch=arm64'
    ];
    
    for (const cmd of commands) {
      try {
        console.log(`🔄 Running: ${cmd}`);
        execSync(cmd, { 
          cwd: projectRoot,
          stdio: 'inherit'
        });
        console.log(`✅ Successfully rebuilt with: ${cmd}`);
        break;
      } catch (e) {
        console.log(`⚠️  Command failed, trying next approach...`);
      }
    }
    
    // Also rebuild in main package if it exists
    const mainBetterSqlite = path.join(projectRoot, 'main', 'node_modules', 'better-sqlite3');
    if (fs.existsSync(mainBetterSqlite)) {
      console.log('🔧 Rebuilding better-sqlite3 in main package...');
      try {
        execSync('npx electron-rebuild -f -w better-sqlite3', {
          cwd: path.join(projectRoot, 'main'),
          stdio: 'inherit'
        });
        console.log('✅ Main package better-sqlite3 rebuilt');
      } catch (e) {
        console.log('⚠️  Main package rebuild failed');
      }
    }
    
  } catch (e) {
    console.error('❌ Failed to rebuild better-sqlite3:', e.message);
  }
}

// Main execution
const projectRoot = path.resolve(__dirname, '..');

// Fix Electron installation
const electronPaths = findElectronPaths(projectRoot);
if (electronPaths.length === 0) {
  console.error('❌ No Electron installations found!');
  process.exit(1);
}

electronPaths.forEach(fixElectronInstall);

// Rebuild native modules
rebuildBetterSqlite3();

console.log('\n🎉 Installation fixes complete!');