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
    // Get the actual target folder name (editor-api -> editor)
    const targetFolderName = repo.name === 'editor-api' ? 'editor' : repo.name;
    
    // Look for the sitemap in the target folder, not necessarily the repo name folder
    const sitemapPath = path.join('docs', targetFolderName, 'sitemap.xml');
    
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
            
            // Special handling for engine-v1 repository
            if (repo.name === 'engine-v1' && normalizedPath.startsWith('engine/')) {
              // For engine-v1, remove the 'engine/' prefix from paths
              const pathWithoutEngine = normalizedPath.replace(/^engine\//, '');
              finalUrl = `${siteUrl}/${targetFolderName}/${pathWithoutEngine}`;
            }
            // Special handling for editor-api repository
            else if (repo.name === 'editor-api' && normalizedPath.startsWith('editor/')) {
              // For editor-api, remove the 'editor/' prefix from paths
              const pathWithoutEditor = normalizedPath.replace(/^editor\//, '');
              finalUrl = `${siteUrl}/${targetFolderName}/${pathWithoutEditor}`;
            }
            // Regular handling for other repositories
            else if (normalizedPath.startsWith(`${normalizedRepoName}/`)) {
              // Replace repository name in path with target folder name
              const adjustedPath = urlPath.replace(normalizedRepoName, targetFolderName);
              finalUrl = `${siteUrl}${adjustedPath}`;
            } else {
              finalUrl = `${siteUrl}/${targetFolderName}/${normalizedPath}`;
            }
          } else {
            // For relative URLs, normalize paths
            const normalizedUrl = url.replace(/^\//, '');
            const normalizedRepoName = repo.name.replace(/^\//, '').replace(/\/$/, '');
            
            // Special handling for engine-v1 repository
            if (repo.name === 'engine-v1' && normalizedUrl.startsWith('engine/')) {
              // For engine-v1, remove the 'engine/' prefix from paths
              const urlWithoutEngine = normalizedUrl.replace(/^engine\//, '');
              finalUrl = `${siteUrl}/${targetFolderName}/${urlWithoutEngine}`;
            }
            // Special handling for editor-api repository
            else if (repo.name === 'editor-api' && normalizedUrl.startsWith('editor/')) {
              // For editor-api, remove the 'editor/' prefix from paths
              const pathWithoutEditor = normalizedUrl.replace(/^editor\//, '');
              finalUrl = `${siteUrl}/${targetFolderName}/${pathWithoutEditor}`;
            }
            // Regular handling for other repositories
            else if (normalizedUrl.startsWith(`${normalizedRepoName}/`)) {
              // Replace repository name in path with target folder name
              const adjustedUrl = normalizedUrl.replace(normalizedRepoName, targetFolderName);
              finalUrl = `${siteUrl}/${adjustedUrl}`;
            } else {
              finalUrl = `${siteUrl}/${targetFolderName}/${normalizedUrl}`;
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
      console.warn(`Warning: No sitemap found for ${repo.name} at ${sitemapPath}`);
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
 * Generate redirect files for old URL patterns to new structure
 */
function generateRedirects() {
  console.log('Generating redirects for old URL structure...');
  
  // Define the patterns to match and their redirects
  const patterns = [
    {
      oldDir: 'classes',
      pattern: /^Engine\.(.+)\.html$/,
      newPath: '/engine/classes/$1.html'
    },
    {
      oldDir: 'interfaces',
      pattern: /^Engine\.(.+)\.html$/,
      newPath: '/engine/interfaces/$1.html'
    },
    {
      oldDir: 'types',
      pattern: /^Engine\.(.+)\.html$/,
      newPath: '/engine/types/$1.html'
    },
    {
      oldDir: 'modules',
      pattern: /^Engine\.(.+)\.html$/,
      newPath: '/engine/modules/$1.html'
    },
    {
      oldDir: 'functions',
      pattern: /^Engine\.(.+)\.html$/,
      newPath: '/engine/functions/$1.html'
    }
  ];
  
  // Create all the necessary directories and redirect files
  for (const { oldDir, pattern, newPath } of patterns) {
    const dirPath = path.join('docs', oldDir);
    ensureDir(dirPath);
    
    // Create a catch-all index.html in the directory for redirecting
    const indexPath = path.join(dirPath, 'index.html');
    const indexContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <script>
    (function() {
      var path = window.location.pathname;
      var filename = path.split('/').pop();
      
      if (filename) {
        var match = filename.match(${pattern.toString()});
        if (match && match[1]) {
          var newUrl = "${newPath}".replace('$1', match[1]);
          window.location.href = newUrl;
          return;
        }
      }
      
      // If no match or no filename, redirect to homepage
      window.location.href = '/';
    })();
  </script>
</head>
<body>
  <p>Redirecting to the new API reference structure...</p>
</body>
</html>`;
    
    fs.writeFileSync(indexPath, indexContent);
    console.log(`Created redirect for /${oldDir}/* pattern`);
  }
  
  // Create a 404 page that attempts to handle redirects as well
  const notFoundPath = path.join('docs', '404.html');
  const notFoundContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Page Not Found</title>
  <script>
    (function() {
      const path = window.location.pathname;
      const segments = path.split('/');
      const filename = segments.pop();
      const dirType = segments.pop();
      
      // Check if this matches our old URL pattern
      if (dirType && filename && ['classes', 'functions', 'interfaces', 'modules', 'types', 'variables'].includes(dirType)) {
        const match = filename.match(/^Engine\.(.+)\.html$/);
        if (match && match[1]) {
          const newUrl = "/engine/" + dirType + "/" + match[1] + ".html";
          window.location.href = newUrl;
          return;
        }
      }
      
      // Default fallback - go to homepage
      window.location.href = '/';
    })();
  </script>
</head>
<body>
  <h1>Page Not Found</h1>
  <p>Redirecting to the new URL structure...</p>
</body>
</html>`;

  fs.writeFileSync(notFoundPath, notFoundContent);
  console.log('Created 404 page with redirection logic');
  
  console.log('Redirect generation complete.');
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
    
    // Create .nojekyll file to prevent GitHub Pages from using Jekyll
    console.log('Creating .nojekyll file...');
    fs.writeFileSync(path.join('docs', '.nojekyll'), '');
    
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
        // Use "editor" folder for editor-api repository
        const targetFolderName = repo.name === 'editor-api' ? 'editor' : repo.name;
        const targetDir = path.join(process.cwd(), '..', '..', 'docs', targetFolderName);
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
    
    // Generate redirects for old URLs
    console.log('\nGenerating redirects for old URL structure...');
    generateRedirects();
    
    console.log('\nDocumentation build complete. Run "npm run serve" to view it.');
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

// Run the build process
buildDocs(); 