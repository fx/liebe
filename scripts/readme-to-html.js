#!/usr/bin/env node

/**
 * Convert README.md to index.html for GitHub Pages
 * Uses markdown-it to parse markdown and creates a styled HTML page
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple markdown to HTML converter without external dependencies
function convertMarkdownToHTML(markdown) {
  let html = markdown;
  
  // Convert headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Convert bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Convert italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Convert inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Convert code blocks
  html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code.trim())}</code></pre>`;
  });
  
  // Convert links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Convert line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  
  // Convert lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\s*)+/g, (match) => {
    return '<ul>' + match + '</ul>';
  });
  
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  
  return html;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Read README.md
const readmePath = path.join(__dirname, '..', 'README.md');
const readme = fs.readFileSync(readmePath, 'utf-8');

// Convert to HTML
const content = convertMarkdownToHTML(readme);

// Create full HTML page
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Liebe - Beautiful Dashboard for Home Assistant</title>
    <meta name="description" content="A beautiful, touch-optimized dashboard for Home Assistant with flexible grid layouts and drag & drop configuration.">
    
    <style>
      :root {
        --color-text: #1a1a1a;
        --color-bg: #ffffff;
        --color-code-bg: #f6f8fa;
        --color-link: #0969da;
        --color-border: #d0d7de;
      }
      
      @media (prefers-color-scheme: dark) {
        :root {
          --color-text: #e6edf3;
          --color-bg: #0d1117;
          --color-code-bg: #161b22;
          --color-link: #58a6ff;
          --color-border: #30363d;
        }
      }
      
      * {
        box-sizing: border-box;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: var(--color-text);
        background-color: var(--color-bg);
        margin: 0;
        padding: 0;
      }
      
      .container {
        max-width: 768px;
        margin: 0 auto;
        padding: 2rem 1rem;
      }
      
      h1 {
        font-size: 2.5rem;
        font-weight: 600;
        margin: 0 0 1rem 0;
        line-height: 1.2;
      }
      
      h2 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 2rem 0 1rem 0;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--color-border);
      }
      
      h3 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 1.5rem 0 0.5rem 0;
      }
      
      p {
        margin: 0 0 1rem 0;
      }
      
      a {
        color: var(--color-link);
        text-decoration: none;
      }
      
      a:hover {
        text-decoration: underline;
      }
      
      code {
        font-family: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
        font-size: 85%;
        background-color: var(--color-code-bg);
        padding: 0.2em 0.4em;
        border-radius: 6px;
      }
      
      pre {
        background-color: var(--color-code-bg);
        border-radius: 6px;
        padding: 1rem;
        overflow-x: auto;
        margin: 0 0 1rem 0;
      }
      
      pre code {
        background-color: transparent;
        padding: 0;
        font-size: 85%;
        line-height: 1.45;
      }
      
      ul {
        margin: 0 0 1rem 0;
        padding-left: 2rem;
      }
      
      li {
        margin: 0.25rem 0;
      }
      
      .github-link {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 2rem;
        padding: 0.5rem 1rem;
        background-color: var(--color-code-bg);
        border-radius: 6px;
        font-weight: 500;
      }
      
      .github-link svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }
    </style>
  </head>
  <body>
    <div class="container">
      ${content}
      
      <a href="https://github.com/fx/liebe" class="github-link">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
        </svg>
        View on GitHub
      </a>
    </div>
  </body>
</html>`;

// Write to stdout
console.log(html);