import dotenv from 'dotenv';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../../../../../sivaTheGreat/dashboard/.env') }); // absolute path to workspace root .env

function buildOAuthClient() {
  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

async function run() {
  const auth = buildOAuthClient();
  const sc = google.searchconsole({ version: 'v1', auth });
  try {
    const res = await sc.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: 'https://intoaec.ai/',
        siteUrl: 'sc-domain:intoaec.ai'
      }
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Inspection error:', err.response?.data || err.message);
  }
}
run();
