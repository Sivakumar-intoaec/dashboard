import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  YOUTUBE_CHANNEL_HANDLE,
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

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });

  try {
    const channelRes = await youtube.channels.list({
      part: ['id', 'snippet', 'statistics'],
      forHandle: (YOUTUBE_CHANNEL_HANDLE || '').replace('@', ''),
    });

    console.log('\nChannel lookup result:');
    console.log(JSON.stringify(channelRes.data, null, 2));
  } catch (err) {
    console.error('\nChannel lookup error:');
    console.error(err.message);
    console.error(JSON.stringify(err.response?.data || {}, null, 2));
  }

  try {
    const res = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate: '2024-01-01',
      endDate: '2024-01-02',
      metrics: 'views',
      dimensions: 'day'
    });

    console.log('\nYouTube Analytics query result:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('\nYouTube Analytics query error:');
    console.error(err.message);
    console.error(JSON.stringify(err.response?.data || {}, null, 2));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
