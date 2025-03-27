#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the repos to clone
const REPOS = [
  { name: 'engine', url: 'https://github.com/playcanvas/engine.git' },
  { name: 'pcui', url: 'https://github.com/playcanvas/pcui.git' },
  { name: 'observer', url: 'https://github.com/playcanvas/playcanvas-observer.git' },
  { name: 'editor-api', url: 'https://github.com/playcanvas/editor-api.git' },
  { name: 'pcui-graph', url: 'https://github.com/playcanvas/pcui-graph.git' },
  { name: 'web-components', url: 'https://github.com/playcanvas/web-components.git' }
];

/**
 * Execute shell command and display the output
 */
function runCommand(command, options = {}) {
  console.log(`Running: ${command}`);
  return execSync(command, { stdio: 'inherit', ...options });
}

/**
 * Delete directory if it exists
 */
function deleteDir(dir) {
  if (fs.existsSync(dir)) {
    console.log(`Removing existing directory: ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create directory if it doesn't exist
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Copy directory contents recursively
 */
function copyDirContents(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`Source directory doesn't exist: ${src}`);
    return;
  }

  ensureDir(dest);
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirContents(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Main function to build the documentation
 */
async function buildDocs() {
  try {
    // Create docs directory if it doesn't exist
    ensureDir('docs');
    
    // Remove existing repos directory and create a new one
    deleteDir('repos');
    ensureDir('repos');
    
    // Process each repository
    for (const repo of REPOS) {
      console.log(`\n========== Processing ${repo.name} ==========`);
      
      // Change to repos directory
      process.chdir(path.join(process.cwd(), 'repos'));
      
      // Clone the repository
      runCommand(`git clone ${repo.url} ${repo.name}`);
      
      // Change to repository directory
      process.chdir(path.join(process.cwd(), repo.name));
      
      // Install dependencies
      runCommand('npm install');
      
      // Build documentation
      runCommand('npm run docs');
      
      // Copy docs to the main docs directory if they exist
      const docsDir = path.join(process.cwd(), 'docs');
      if (fs.existsSync(docsDir)) {
        const targetDir = path.join(process.cwd(), '..', '..', 'docs', repo.name);
        console.log(`Copying docs from ${docsDir} to ${targetDir}`);
        ensureDir(targetDir);
        copyDirContents(docsDir, targetDir);
      }
      
      // Return to root directory
      process.chdir(path.join(process.cwd(), '..', '..'));
      
      console.log(`Completed processing ${repo.name}`);
    }
    
    // Copy the index.html to the docs directory
    console.log('\nCopying index.html file...');
    const sourceIndexPath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(sourceIndexPath)) {
      throw new Error(`Source index.html not found: ${sourceIndexPath}`);
    }
    fs.copyFileSync(sourceIndexPath, path.join('docs', 'index.html'));
    
    // Copy favicon
    console.log('Copying favicon...');
    fs.copyFileSync('favicon.ico', path.join('docs', 'favicon.ico'));
    
    console.log('\nDocumentation build complete. Run "npm run serve" to view it.');
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

// Run the build process
buildDocs(); 