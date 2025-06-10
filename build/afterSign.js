const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  const { appOutDir, packager } = context;
  
  if (packager.platform.name !== 'mac') {
    return;
  }

  console.log('Removing problematic JARs that contain unsigned native libraries...');
  
  const appPath = path.join(appOutDir, `${packager.appInfo.productName}.app`);
  const claudeCodePath = path.join(appPath, 'Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-code');
  
  if (!fs.existsSync(claudeCodePath)) {
    console.log('Claude Code path not found, skipping JAR removal');
    return;
  }

  // Remove the problematic jansi JAR that contains unsigned native libraries
  const problematicJars = [
    'vendor/claude-code-jetbrains-plugin/lib/jansi-2.4.1.jar'
  ];

  for (const jarPath of problematicJars) {
    const fullPath = path.join(claudeCodePath, jarPath);
    if (fs.existsSync(fullPath)) {
      console.log(`Removing problematic JAR: ${fullPath}`);
      fs.unlinkSync(fullPath);
    }
  }
  
  console.log('Problematic JAR removal complete');
};