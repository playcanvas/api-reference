#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load repository configuration from JSON file
let REPOS = [];
try {
  const configPath = path.join(__dirname, 'repos-config.json');
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  REPOS = configData.repositories;
  console.log(`Loaded ${REPOS.length} repositories from configuration file`);
} catch (error) {
  console.error(`Error loading repository configuration: ${error.message}`);
  process.exit(1);
}

/**
 * Parse command line arguments to override repository branches
 */
function parseBranchArgs() {
  const args = process.argv.slice(2);
  
  // Process arguments in the format: repo=branch (e.g., engine=dev)
  for (const arg of args) {
    const match = arg.match(/^([^=]+)=(.+)$/);
    if (match) {
      const [, repoName, branchName] = match;
      const repo = REPOS.find(r => r.name === repoName);
      
      if (repo) {
        console.log(`Setting custom branch for ${repoName}: ${branchName}`);
        repo.branch = branchName;
      } else {
        console.warn(`Warning: Unknown repository '${repoName}' specified in arguments`);
      }
    }
  }
}

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
 * Combine sitemap.xml files from all repositories
 */
function combineSitemaps() {
  const sitemaps = [];
  let siteUrl = 'https://api.playcanvas.com';
  
  // Check the package.json for homepage URL
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (packageJson.homepage) {
      siteUrl = packageJson.homepage;
    }
  } catch (error) {
    console.warn('Warning: Could not read package.json to determine site URL.');
  }
  
  // Remove trailing slash if present
  siteUrl = siteUrl.replace(/\/$/, '');
  
  console.log(`Using site URL: ${siteUrl}`);
  
  // Collect URLs from each repository's sitemap
  for (const repo of REPOS) {
    const sitemapPath = path.join('docs', repo.name, 'sitemap.xml');
    if (fs.existsSync(sitemapPath)) {
      try {
        const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
        console.log(`Processing sitemap for ${repo.name} (${sitemapPath})`);
        
        // Extract URLs and lastmod times using regex
        const urlRegex = /<url>[\s\S]*?<loc>(.*?)<\/loc>(?:[\s\S]*?<lastmod>(.*?)<\/lastmod>)?[\s\S]*?<\/url>/g;
        let match;
        let count = 0;
        
        while ((match = urlRegex.exec(sitemapContent)) !== null) {
          let url = match[1];
          const lastmod = match[2] || '';
          let finalUrl = '';
          
          // Make relative to site root if needed
          if (url.startsWith('http')) {
            // Extract the path portion from the URL
            const urlPath = new URL(url).pathname;
            
            // Remove leading slash for consistency in checks
            const normalizedPath = urlPath.replace(/^\//, '');
            const normalizedRepoName = repo.name.replace(/^\//, '').replace(/\/$/, '');
            
            // Check if the path already includes the repo name to avoid duplication
            if (normalizedPath.startsWith(`${normalizedRepoName}/`)) {
              finalUrl = `${siteUrl}${urlPath}`;
            } else {
              finalUrl = `${siteUrl}/${normalizedRepoName}/${normalizedPath}`;
            }
          } else {
            // For relative URLs, normalize paths
            const normalizedUrl = url.replace(/^\//, '');
            const normalizedRepoName = repo.name.replace(/^\//, '').replace(/\/$/, '');
            
            // Check if the URL already starts with the repo name
            if (normalizedUrl.startsWith(`${normalizedRepoName}/`)) {
              finalUrl = `${siteUrl}/${normalizedUrl}`;
            } else {
              finalUrl = `${siteUrl}/${normalizedRepoName}/${normalizedUrl}`;
            }
          }
          
          let urlEntry = `
    <url>
        <loc>${finalUrl}</loc>`;
          
          // Add lastmod if available
          if (lastmod) {
            urlEntry += `
        <lastmod>${lastmod}</lastmod>`;
          }
          
          urlEntry += `
    </url>`;
          
          sitemaps.push(urlEntry);
          count++;
        }
        
        console.log(`Extracted ${count} URLs from ${repo.name} sitemap`);
      } catch (error) {
        console.warn(`Warning: Could not process sitemap for ${repo.name}: ${error.message}`);
      }
    } else {
      console.warn(`Warning: No sitemap found for ${repo.name}`);
    }
  }
  
  // Add root page to sitemap with current date as lastmod
  const today = new Date().toISOString().split('T')[0];
  sitemaps.unshift(`
    <url>
        <loc>${siteUrl}/</loc>
        <lastmod>${today}</lastmod>
    </url>`);
  
  // Create combined sitemap
  const combinedSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.join('')}
</urlset>`;
  
  // Write to the docs folder
  fs.writeFileSync(path.join('docs', 'sitemap.xml'), combinedSitemap);
  console.log(`Combined sitemap created successfully with ${sitemaps.length} URLs.`);
}

/**
 * Main function to build the documentation
 */
async function buildDocs() {
  try {
    // Parse command line arguments for branch overrides
    parseBranchArgs();
    
    // Create docs directory if it doesn't exist
    ensureDir('docs');
    
    // Remove existing repos directory and create a new one
    deleteDir('repos');
    ensureDir('repos');
    
    // Process each repository
    for (const repo of REPOS) {
      console.log(`\n========== Processing ${repo.name} (branch: ${repo.branch}) ==========`);
      
      // Change to repos directory
      process.chdir(path.join(process.cwd(), 'repos'));
      
      // Clone the repository with specified branch
      runCommand(`git clone -b ${repo.branch} ${repo.url} ${repo.name}`);
      
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
    
    // Copy assets directory if it exists
    if (fs.existsSync('assets')) {
      console.log('Copying assets directory...');
      ensureDir(path.join('docs', 'assets'));
      copyDirContents('assets', path.join('docs', 'assets'));
    }
    
    // Generate combined sitemap
    console.log('\nGenerating combined sitemap...');
    combineSitemaps();
    
    console.log('\nDocumentation build complete. Run "npm run serve" to view it.');
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

// Run the build process
buildDocs(); 