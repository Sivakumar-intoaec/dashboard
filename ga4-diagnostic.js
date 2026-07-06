import dotenv from 'dotenv';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
} = process.env;

async function main() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    console.error('Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN in .env');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

  try {
    const accessToken = await oauth2Client.getAccessToken();
    console.log('Access token acquired:', Boolean(accessToken.token));
  } catch (err) {
    console.error('Failed to acquire access token:', err.message);
    process.exit(1);
  }

  const analyticsAdmin = google.analyticsadmin({ version: 'v1alpha', auth: oauth2Client });

  try {
    const res = await analyticsAdmin.accounts.list({});
    const accounts = res.data.accounts || [];

    console.log('\nAccounts visible to this token:');
    if (!accounts.length) {
      console.log('No accounts returned.');
      return;
    }

    for (const account of accounts) {
      console.log(`- Account: ${account.name || 'N/A'} | displayName: ${account.displayName || 'N/A'}`);

      try {
        const accountId = (account.name || '').split('/').pop();
        const propsRes = await analyticsAdmin.properties.list({
          filter: `parent:${account.name}`,
        });
        const props = propsRes.data.properties || [];
        console.log(`  Properties:`);
        if (!props.length) {
          console.log('    (none)');
          continue;
        }
        for (const prop of props) {
          console.log(`    - ${prop.name || 'N/A'} | displayName: ${prop.displayName || 'N/A'}`);
        }
      } catch (err) {
        console.log(`  Error listing properties for ${account.name}:`, err.message);
      }
    }
  } catch (err) {
    console.error('GA4 admin API error:', err.message);
    console.error(JSON.stringify(err.response?.data || {}, null, 2));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
