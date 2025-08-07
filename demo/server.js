import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = 3010;

const server = http.createServer((req, res) => {
  // Default to working demo
  let filePath = req.url === '/' ? '/public/working-demo.html' : req.url;
  
  // Route aliases
  if (req.url === '/shell' || req.url === '/') {
    filePath = path.join(__dirname, '/public/working-demo.html');
  } else if (req.url === '/examples') {
    filePath = path.join(__dirname, '/public/app-shell-examples.html');
  } else if (req.url.startsWith('/public/') || req.url.startsWith('/dist/')) {
    filePath = path.join(__dirname, '..', req.url);
  } else {
    filePath = path.join(__dirname, filePath);
  }

  // Get file extension to set correct content type
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // File not found - serve working-demo.html for client-side routing
        fs.readFile(path.join(__dirname, 'public/working-demo.html'), (error, content) => {
          if (error) {
            res.writeHead(500);
            res.end('Error loading working-demo.html');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, () => {
  console.log(`🏛️ PUT Platform App Shell Demo Server running at:`);
  console.log(`   Local:   http://localhost:${port}`);
  console.log(`   Network: http://127.0.0.1:${port}`);
  console.log('');
  console.log('🎯 Production Unified Toolkit App Shell Demo:');
  console.log('   • Cloud provider console design');
  console.log('   • Micro-frontend architecture ready');
  console.log('   • Citibank branded components');
  console.log('   • Enterprise accessibility compliance');
  console.log('   • Full TypeScript component library');
  console.log('   • < 2 second module load performance');
  console.log('');
  console.log('📋 PRD Requirements Demonstrated:');
  console.log('   • PUT-001: Single web address access');
  console.log('   • PUT-002: Unified navigation framework');
  console.log('   • PUT-003: Service discovery and catalog');
  console.log('   • PUT-004: Module federation architecture');
  console.log('   • PUT-005: Enterprise design system');
  console.log('');
  console.log('🔗 Available routes:');
  console.log('   • / (PUT Platform App Shell - default)');
  console.log('   • /shell (PUT Platform App Shell)');
  console.log('   • /examples (Layout Examples & Documentation)');
  console.log('');
  console.log('🎯 App Shell Features:');
  console.log('   • PlatformHeader component from @put/core-components');
  console.log('   • PlatformWelcome with service cards');
  console.log('   • Module routing and navigation');
  console.log('   • Citibank design system integration');
  console.log('   • Micro-frontend module placeholders');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\\n🛑 Demo server shutting down...');
  server.close(() => {
    console.log('✅ Server closed gracefully');
  });
});

process.on('SIGINT', () => {
  console.log('\\n🛑 Demo server shutting down...');
  server.close(() => {
    console.log('✅ Server closed gracefully');
  });
});