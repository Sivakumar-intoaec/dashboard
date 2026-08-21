/**
 * IntoAEC — OAuth Token Generator
 * Run this once to generate a new refresh token with ALL required scopes,
 * including Google Search Console (webmasters.readonly).
 *
 * Usage:
 *   node get-token.js
 *
 * Then follow the printed instructions.
 */

import dotenv from 'dotenv';
import { google } from 'googleapis';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

function normalizeEnvValue(v) {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/^['\"]|['\"]$/g, '');
}

const CLIENT_ID = normalizeEnvValue(process.env.GOOGLE_CLIENT_ID);
const CLIENT_SECRET = normalizeEnvValue(process.env.GOOGLE_CLIENT_SECRET);
const REDIRECT_URI = 'http://localhost:3005/oauth2callback';

// ─── ALL scopes required by the dashboard ─────────────────────────────────────
const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',        // GA4
  'https://www.googleapis.com/auth/yt-analytics.readonly',     // YouTube Analytics
  'https://www.googleapis.com/auth/youtube.readonly',          // YouTube Data
  'https://www.googleapis.com/auth/webmasters.readonly',       // Search Console ← NEW
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',   // Force consent screen so Google returns a refresh_token
});

console.log('\n════════════════════════════════════════════════════════════════');
console.log('  IntoAEC OAuth Re-Authorization — Search Console Scope');
console.log('════════════════════════════════════════════════════════════════\n');
console.log('Step 1: Open this URL in your browser:\n');
console.log(' ', authUrl);
console.log('\nStep 2: Sign in with the Google account that owns the Search Console property.');
console.log('Step 3: Click "Allow" on ALL permission screens.');
console.log('\nWaiting for Google to redirect back to localhost:3005 ...\n');

// ─── Temporary local server to catch the OAuth callback ──────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:3005`);
  if (url.pathname !== '/oauth2callback') {
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>❌ OAuth Error: ${error}</h2><p>Close this tab and check the terminal.</p>`);
    console.error('\n❌ OAuth error:', error);
    server.close();
    return;
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h2>❌ No code received</h2>');
    server.close();
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html><body style="font-family:monospace;padding:32px;background:#0d1a2e;color:#fff;">
        <h2 style="color:#34a853;">✅ Authorization successful!</h2>
        <p>Copy the refresh token below and update your <code>.env</code> file.</p>
        <pre style="background:#1a2a3a;padding:16px;border-radius:8px;overflow-wrap:break-word;white-space:pre-wrap;">${tokens.refresh_token || '(no refresh token — see terminal)'}</pre>
        <p style="color:#fbbf24;">⚠️ Close this tab and follow the terminal instructions.</p>
      </body></html>
    `);

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('  ✅ SUCCESS — New Refresh Token');
    console.log('════════════════════════════════════════════════════════════════\n');

    if (tokens.refresh_token) {
      console.log('NEW REFRESH TOKEN:');
      console.log('\n ', tokens.refresh_token, '\n');
      console.log('────────────────────────────────────────────────────────────────');
      console.log('ACTION: Update your .env file:');
      console.log(`  GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('────────────────────────────────────────────────────────────────\n');
      console.log('Then restart the server: npm start\n');
    } else {
      console.log('⚠️  No refresh_token returned. This usually means the account');
      console.log('   already has a valid token. Try revoking access first at:');
      console.log('   https://myaccount.google.com/permissions\n');
      console.log('   Then run: node get-token.js again.\n');
      if (tokens.access_token) {
        console.log('Access token (temporary, not for .env):', tokens.access_token);
      }
    }

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h2>❌ Token exchange failed: ${err.message}</h2>`);
    console.error('\n❌ Token exchange failed:', err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(3005, () => {
  console.log('  (Callback server listening on http://localhost:3005)\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n❌ Port 3005 is in use. Stop any process using it and try again.');
  } else {
    console.error('\n❌ Server error:', err.message);
  }
  process.exit(1);
});
