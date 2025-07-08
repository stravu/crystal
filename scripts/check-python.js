#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');

console.log('Checking Python installation for node-gyp compatibility...\n');

try {
  // Check Python version
  const pythonVersion = execSync('python3 --version', { encoding: 'utf8' }).trim();
  console.log(`Found: ${pythonVersion}`);
  
  // Extract version numbers
  const versionMatch = pythonVersion.match(/Python (\d+)\.(\d+)\.(\d+)/);
  if (versionMatch) {
    const major = parseInt(versionMatch[1]);
    const minor = parseInt(versionMatch[2]);
    
    if (major === 3 && minor >= 12) {
      console.log('\n⚠️  Python 3.12+ detected. Checking for setuptools...');
      
      try {
        execSync('python3 -c "import setuptools"', { stdio: 'ignore' });
        console.log('✅ setuptools is installed - you should be good to go!\n');
      } catch {
        console.log('\n❌ setuptools is not installed. This is required for Python 3.12+.');
        console.log('\nTo fix this, run:');
        console.log('  python3 -m pip install setuptools\n');
        console.log('Alternatively, you can install Python 3.11:');
        
        if (os.platform() === 'darwin') {
          console.log('  brew install python@3.11');
          console.log('  npm config set python python3.11\n');
        } else if (os.platform() === 'linux') {
          console.log('  sudo apt-get install python3.11 python3.11-distutils');
          console.log('  npm config set python python3.11\n');
        }
        
        process.exit(1);
      }
    } else {
      console.log('✅ Python version is compatible with node-gyp\n');
    }
  }
  
  // Check if node-gyp can find Python
  try {
    const nodeGypPython = execSync('node-gyp --version 2>&1', { encoding: 'utf8' });
    console.log('✅ node-gyp is available\n');
  } catch {
    console.log('⚠️  node-gyp is not installed globally. It will be installed as needed.\n');
  }
  
} catch (error) {
  console.error('❌ Python 3 is not installed or not in PATH');
  console.error('\nPlease install Python 3:');
  
  if (os.platform() === 'darwin') {
    console.error('  brew install python@3.11');
  } else if (os.platform() === 'linux') {
    console.error('  sudo apt-get install python3 python3-pip');
  } else if (os.platform() === 'win32') {
    console.error('  Download from https://www.python.org/downloads/');
  }
  
  process.exit(1);
}