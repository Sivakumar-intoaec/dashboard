/**
 * IntoAEC — Analytics Fetcher
 * Pulls data from Facebook, Instagram, GA4, and YouTube,
 * then returns a single JSON payload shaped for the dashboard.
 *
 * Export: runAnalytics() → Promise<DashboardPayload>
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const FETCH_CONCURRENCY = 50;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

function normalizeEnvValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function normalizePropertyId(value) {
  const normalized = normalizeEnvValue(value);
  return normalized.replace(/^properties\//i, '');
}

const GRAPH_API_VERSION = 'v20.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const YOUTUBE_ANALYTICS_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
];

const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, normalizeEnvValue(value)])
);

const {
  PAGE_ID, IG_USER_ID, ACCESS_TOKEN,
  GA_PROPERTY_ID, YOUTUBE_CHANNEL_HANDLE,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
} = rawEnv;

const NORMALIZED_GA_PROPERTY_ID = normalizePropertyId(GA_PROPERTY_ID);

// ─── Google OAuth ────────────────────────────────────────────────────────────
let oauth2Client = null;
let analyticsData = null;
let youtubeAnalytics = null;

function initGoogle() {
  if (
    GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN &&
    GOOGLE_REFRESH_TOKEN !== 'your-refresh-token-here'
  ) {
    oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });
    youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });
    console.log('✅ OAuth configured for GA4 + YouTube Analytics');
    console.log(`   Required YouTube scope: ${YOUTUBE_ANALYTICS_SCOPES[1]}`);
    console.log(`   GA4 property ID resolved to: ${NORMALIZED_GA_PROPERTY_ID || '(none)'}`);
    if (GA_PROPERTY_ID && GA_PROPERTY_ID !== NORMALIZED_GA_PROPERTY_ID) {
      console.log(`   GA4 property ID normalized from: ${GA_PROPERTY_ID}`);
    }
  } else {
    console.log('⚠️  OAuth not fully configured — GA4 & YouTube Analytics will be skipped.');
  }
}

function formatYouTubeAnalyticsError(err) {
  const message = err?.message || '';
  if (/insufficient permission|permission|scope/i.test(message)) {
    return 'YouTube Analytics scope not granted. Re-authorize the Google account with the yt-analytics.readonly scope.';
  }
  return message;
}

const youtubePublicApi = () => {
  if (!oauth2Client) return null;
  return google.youtube({ version: 'v3', auth: oauth2Client });
};

// ─── Facebook ────────────────────────────────────────────────────────────────
let PAGE_TOKEN = null;
const fbApi = axios.create({ baseURL: BASE_URL, timeout: 30000 });
const igApi = axios.create({ baseURL: BASE_URL, timeout: 30000, params: { access_token: ACCESS_TOKEN } });

async function getPageToken() {
  if (PAGE_TOKEN) return PAGE_TOKEN;
  const res = await axios.get(`${BASE_URL}/${PAGE_ID}`, {
    params: { fields: 'access_token', access_token: ACCESS_TOKEN }
  });
  PAGE_TOKEN = res.data.access_token;
  if (!PAGE_TOKEN) throw new Error('No page token returned');
  fbApi.defaults.params = { access_token: PAGE_TOKEN };
  console.log('✅ Got Page Token');
  return PAGE_TOKEN;
}

async function fetchFbPageInfo() {
  const fields = 'id,name,username,about,website,fan_count,followers_count,link,picture';
  const res = await fbApi.get(`/${PAGE_ID}`, { params: { fields } });
  console.log(`📘 FB: ${res.data.name} | Fans: ${res.data.fan_count}`);
  return res.data;
}

async function fetchFbPageInsights() {
  try {
    const since = Math.floor((Date.now() - 28 * 86400000) / 1000);
    const until = Math.floor(Date.now() / 1000);
    const res = await fbApi.get(`/${PAGE_ID}/insights`, {
      params: { metric: 'page_impressions,page_impressions_unique,page_views_total', period: 'day', since, until }
    });
    const data = res.data.data || [];
    const sum = (name) => (data.find(i => i.name === name)?.values || []).reduce((s, v) => s + (v.value || 0), 0);
    return { totalImpressions: sum('page_impressions'), totalReach: sum('page_impressions_unique'), totalPageViews: sum('page_views_total') };
  } catch { return { totalImpressions: 0, totalReach: 0, totalPageViews: 0 }; }
}

async function fetchFbPostInsights(postId) {
  try {
    const res = await fbApi.get(`/${postId}/insights`, {
      params: { metric: 'post_impressions,post_impressions_unique,post_engaged_users' }
    });
    const data = res.data.data || [];
    const get = (name) => data.find(i => i.name === name)?.values[0]?.value || 0;
    return { impressions: get('post_impressions'), reach: get('post_impressions_unique'), engaged: get('post_engaged_users') };
  } catch { return { impressions: 0, reach: 0, engaged: 0 }; }
}

async function fetchFbAllPosts(concurrency = FETCH_CONCURRENCY) {
  let posts = [];
  let nextUrl = `/${PAGE_ID}/posts`;
  const fields = 'id,message,created_time,status_type,permalink_url,full_picture,attachments,likes.summary(true),comments.summary(true),shares,place';
  while (nextUrl) {
    const res = nextUrl.startsWith('http')
      ? await axios.get(nextUrl)
      : await fbApi.get(nextUrl, { params: { fields, limit: 100 } });
    if (res.data.data?.length) posts.push(...res.data.data);
    nextUrl = res.data.paging?.next || null;
  }
  console.log(`📝 Fetching FB insights for ${posts.length} posts… (${concurrency} concurrent)`);
  const total = posts.length;
  let done = 0;
  await parallelMap(posts, async (post, i) => {
    post.insights = await fetchFbPostInsights(post.id);
    done++;
    if (done % 10 === 0 || done === total) process.stdout.write(`\r  FB post ${done}/${total}   `);
  }, concurrency);
  console.log();
  return posts;
}

function processFbPosts(rawPosts) {
  return rawPosts.map(post => {
    const ins = post.insights || {};
    const likes = post.likes?.summary?.total_count || 0;
    const comments = post.comments?.summary?.total_count || 0;
    const shares = post.shares?.count || 0;
    const att = post.attachments?.data?.[0];
    let type = 'status';
    if (att) {
      type = att.type === 'photo' ? 'photo' : att.type === 'video_inline' || att.type === 'video_autoplay' ? 'video' : att.type === 'album' ? 'album' : att.media_type || att.type || 'link';
    } else if (post.status_type === 'added_photos') type = 'photo';
    else if (post.status_type === 'added_video') type = 'video';
    const place = post.place || {};
    const loc = place.location || {};
    return {
      id: post.id, type,
      caption: post.message || '',
      date: post.created_time.slice(0, 10),
      url: post.permalink_url,
      thumbnailUrl: post.full_picture || '',
      likes, comments, shares,
      impressions: ins.impressions || 0,
      reach: ins.reach || 0,
      engaged: ins.engaged || 0,
      taggedLocation: place.name || '',
      latitude: loc.latitude || null,
      longitude: loc.longitude || null,
      mediaViews: ins.impressions || 0,
      engagement: likes + comments + shares,
      engagementRate: ins.reach > 0 ? +(((likes + comments + shares) / ins.reach) * 100).toFixed(2) : 0
    };
  });
}

// ─── Instagram ───────────────────────────────────────────────────────────────
async function fetchIgAccountInfo() {
  const fields = 'id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url';
  const res = await igApi.get(`/${IG_USER_ID}`, { params: { fields } });
  console.log(`📸 IG: @${res.data.username} | Followers: ${res.data.followers_count}`);
  return res.data;
}

async function fetchIgAccountInsights() {
  try {
    const res = await igApi.get(`/${IG_USER_ID}/insights`, {
      params: {
        metric: 'views,reach,profile_views,website_clicks', period: 'day', metric_type: 'total_value',
        since: Math.floor((Date.now() - 28 * 86400000) / 1000), until: Math.floor(Date.now() / 1000)
      }
    });
    const data = res.data.data || [];
    const sum = (name) => (data.find(i => i.name === name)?.values || []).reduce((s, v) => s + (v.value || 0), 0);
    return { totalImpressions: sum('views'), totalReach: sum('reach'), totalProfileViews: sum('profile_views'), totalWebsiteClicks: sum('website_clicks') };
  } catch { return { totalImpressions: 0, totalReach: 0, totalProfileViews: 0, totalWebsiteClicks: 0 }; }
}

async function fetchIgAudienceInsights() {
  try {
    const res = await igApi.get(`/${IG_USER_ID}/insights`, {
      params: { metric: 'audience_country,audience_city,audience_gender_age', period: 'lifetime' }
    });
    const data = res.data.data || [];
    const toList = (name) => Object.entries(data.find(i => i.name === name)?.values[0]?.value || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([location, count]) => ({ location, count }));
    return { topCountries: toList('audience_country'), topCities: toList('audience_city'), genderAgeData: data.find(i => i.name === 'audience_gender_age')?.values[0]?.value || {} };
  } catch { return { topCountries: [], topCities: [], genderAgeData: {} }; }
}

async function fetchIgMediaInsights(mediaId, mediaType) {
  try {
    const metricsMap = {
      VIDEO: 'impressions,reach,likes,comments,shares,saved,video_views',
      REEL: 'reach,likes,comments,shares,saved,plays',
      STORY: 'impressions,reach,replies',
    };
    const metric = metricsMap[mediaType] || 'impressions,reach,likes,comments,shares,saved';
    const res = await igApi.get(`/${mediaId}/insights`, { params: { metric } });
    const data = res.data.data || [];
    const get = (name) => data.find(i => i.name === name)?.values[0]?.value || 0;
    return { impressions: get('impressions'), reach: get('reach'), likes: get('likes'), comments: get('comments'), shares: get('shares'), saves: get('saved'), videoViews: get('video_views'), plays: get('plays'), replies: get('replies') };
  } catch { return { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, videoViews: 0, plays: 0, replies: 0 }; }
}

async function fetchIgAllMedia(concurrency = FETCH_CONCURRENCY) {
  let media = [];
  let nextUrl = `/${IG_USER_ID}/media`;
  const fields = 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,thumbnail_url';
  while (nextUrl) {
    const res = nextUrl.startsWith('http')
      ? await axios.get(nextUrl)
      : await igApi.get(nextUrl, { params: { fields, limit: 100 } });
    if (res.data.data?.length) media.push(...res.data.data);
    nextUrl = res.data.paging?.next || null;
  }
  console.log(`📝 Fetching IG insights for ${media.length} items… (${concurrency} concurrent)`);
  const total = media.length;
  let done = 0;
  await parallelMap(media, async (item) => {
    item.insights = await fetchIgMediaInsights(item.id, item.media_type);
    done++;
    if (done % 10 === 0 || done === total) process.stdout.write(`\r  IG media ${done}/${total}   `);
  }, concurrency);
  console.log();
  return media;
}

function processIgMedia(rawMedia) {
  return rawMedia.map(post => {
    const ins = post.insights || {};
    const likes = post.like_count || 0;
    const comments = post.comments_count || 0;
    const shares = ins.shares || 0;
    const saves = ins.saves || 0;
    const engagement = likes + comments + shares + saves;
    // Normalise type: IMAGE/CAROUSEL_ALBUM → FEED, VIDEO → REELS-compatible
    const rawType = post.media_type || 'FEED';
    const type = rawType === 'VIDEO' ? 'REELS' : rawType === 'IMAGE' || rawType === 'CAROUSEL_ALBUM' ? 'FEED' : rawType;
    return {
      id: post.id, type,
      caption: post.caption || '',
      date: post.timestamp.slice(0, 10),
      url: post.permalink,
      thumbnailUrl: post.thumbnail_url || post.media_url,
      likes, comments, shares, saves,
      impressions: ins.impressions || 0,
      reach: ins.reach || 0,
      videoViews: ins.videoViews || 0,
      plays: ins.plays || 0,
      replies: ins.replies || 0,
      engagement,
      engagementRate: ins.reach > 0 ? +((engagement / ins.reach) * 100).toFixed(2) : 0
    };
  });
}

// ─── Google Analytics 4 ──────────────────────────────────────────────────────
async function getGA4Metrics(startDate = '30daysAgo', endDate = 'today') {
  if (!analyticsData) return [];
  try {
    const res = await analyticsData.properties.runReport({
      property: `properties/${NORMALIZED_GA_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' },
          { name: 'screenPageViews' }, { name: 'bounceRate' },
          { name: 'averageSessionDuration' }, { name: 'conversions' }
        ]
      }
    });
    return res.data.rows || [];
  } catch (err) { console.error('❌ GA4 metrics:', err.message); return []; }
}

async function getGA4TrafficSources(startDate = '30daysAgo', endDate = 'today') {
  if (!analyticsData) return [];
  try {
    const res = await analyticsData.properties.runReport({
      property: `properties/${NORMALIZED_GA_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10
      }
    });
    return res.data.rows || [];
  } catch (err) { console.error('❌ GA4 traffic:', err.message); return []; }
}

async function getGA4TopPages(startDate = '365daysAgo', endDate = 'today') {
  if (!analyticsData) return [];
  try {
    const res = await analyticsData.properties.runReport({
      property: `properties/${NORMALIZED_GA_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 15
      }
    });
    return res.data.rows || [];
  } catch (err) { console.error('❌ GA4 pages:', err.message); return []; }
}

async function getGA4TopCountries(startDate = '2020-01-01', endDate = 'today') {
  if (!analyticsData) return [];
  try {
    const res = await analyticsData.properties.runReport({
      property: `properties/${NORMALIZED_GA_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 15
      }
    });
    return res.data.rows || [];
  } catch (err) { console.error('❌ GA4 countries:', err.message); return []; }
}

// ─── LinkedIn via GA4 ────────────────────────────────────────────────────────
// GA4 captures LinkedIn as a traffic source (sessionSource contains 'linkedin').
// These functions extract LinkedIn-specific metrics from the GA4 property.

async function getLinkedInDailyMetrics(startDate = '90daysAgo', endDate = 'today') {
  if (!analyticsData) return [];
  try {
    const res = await analyticsData.properties.runReport({
      property: `properties/${NORMALIZED_GA_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' },
          { name: 'screenPageViews' }, { name: 'averageSessionDuration' },
          { name: 'bounceRate' }, { name: 'conversions' }
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionSource',
            stringFilter: { matchType: 'CONTAINS', value: 'linkedin', caseSensitive: false }
          }
        }
      }
    });
    return res.data.rows || [];
  } catch (err) { console.error('❌ LinkedIn daily metrics:', err.message); return []; }
}

async function getLinkedInTopPages(startDate = '365daysAgo', endDate = 'today') {
  if (!analyticsData) return [];
  try {
    const res = await analyticsData.properties.runReport({
      property: `properties/${NORMALIZED_GA_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionSource',
            stringFilter: { matchType: 'CONTAINS', value: 'linkedin', caseSensitive: false }
          }
        },
        limit: 15
      }
    });
    return res.data.rows || [];
  } catch (err) { console.error('❌ LinkedIn top pages:', err.message); return []; }
}

async function getLinkedInVsSocialChannels(startDate = '90daysAgo', endDate = 'today') {
  if (!analyticsData) return [];
  try {
    const res = await analyticsData.properties.runReport({
      property: `properties/${NORMALIZED_GA_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionSource' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionDefaultChannelGroup',
            stringFilter: { matchType: 'CONTAINS', value: 'Social', caseSensitive: false }
          }
        },
        limit: 12
      }
    });
    return res.data.rows || [];
  } catch (err) { console.error('❌ LinkedIn vs social channels:', err.message); return []; }
}

async function getLinkedInDeviceBreakdown(startDate = '90daysAgo', endDate = 'today') {
  if (!analyticsData) return [];
  try {
    const res = await analyticsData.properties.runReport({
      property: `properties/${NORMALIZED_GA_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionSource',
            stringFilter: { matchType: 'CONTAINS', value: 'linkedin', caseSensitive: false }
          }
        }
      }
    });
    return res.data.rows || [];
  } catch (err) { console.error('❌ LinkedIn device breakdown:', err.message); return []; }
}

// ─── YouTube ─────────────────────────────────────────────────────────────────
async function getYouTubeChannelId() {
  const yt = youtubePublicApi();
  if (!yt) throw new Error('YouTube OAuth not configured');
  const res = await yt.channels.list({ part: 'id', forHandle: YOUTUBE_CHANNEL_HANDLE.replace('@', '') });
  const id = res.data.items?.[0]?.id;
  if (!id) throw new Error('YouTube channel not found');
  console.log(`✅ YouTube Channel ID: ${id}`);
  return id;
}

async function getYouTubePublicStats(channelId) {
  const yt = youtubePublicApi();
  if (!yt) throw new Error('YouTube OAuth not configured');
  const res = await yt.channels.list({ part: 'statistics,snippet,brandingSettings,contentDetails', id: channelId });
  return res.data.items?.[0] || null;
}

async function fetchYouTubeAllVideos(uploadsPlaylistId) {
  const yt = youtubePublicApi();
  if (!yt) throw new Error('YouTube OAuth not configured');
  let videos = [];
  let nextPageToken = null;
  do {
    const playlistRes = await yt.playlistItems.list({
      part: 'snippet,contentDetails', playlistId: uploadsPlaylistId, maxResults: 50, pageToken: nextPageToken
    });
    const ids = playlistRes.data.items.map(i => i.contentDetails.videoId);
    if (ids.length) {
      const vidRes = await yt.videos.list({ part: 'snippet,statistics', id: ids.join(',') });
      videos.push(...vidRes.data.items);
    }
    nextPageToken = playlistRes.data.nextPageToken;
  } while (nextPageToken);
  console.log(`✅ Fetched ${videos.length} YouTube videos`);
  return videos.map(v => ({
    id: v.id,
    title: v.snippet.title,
    date: v.snippet.publishedAt.slice(0, 10),
    // Classify: videos under ~3 min (180s) or with #Shorts in title are Shorts
    type: v.snippet.title.toLowerCase().includes('#short') || v.snippet.title.toLowerCase().includes('shorts') ? 'SHORT' : 'LONG',
    views: parseInt(v.statistics.viewCount || 0),
    likes: parseInt(v.statistics.likeCount || 0),
    comments: parseInt(v.statistics.commentCount || 0),
    url: `https://www.youtube.com/watch?v=${v.id}`
  }));
}

async function getYouTubeAnalytics(channelId, startDate, endDate) {
  if (!youtubeAnalytics) return { rows: [], error: null };
  try {
    const res = await youtubeAnalytics.reports.query({
      ids: `channel==${channelId}`, startDate, endDate,
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,shares,comments',
      dimensions: 'day'
    });
    return { rows: res.data.rows || [], error: null };
  } catch (err) {
    const error = formatYouTubeAnalyticsError(err);
    console.warn(`⚠️  YT Analytics unavailable: ${error}`);
    return { rows: [], error };
  }
}

async function getYouTubeTopVideos(channelId, startDate, endDate) {
  if (!youtubeAnalytics) return { rows: [], error: null };
  try {
    const res = await youtubeAnalytics.reports.query({
      ids: `channel==${channelId}`, startDate, endDate,
      metrics: 'views,estimatedMinutesWatched,likes,comments,shares',
      dimensions: 'video', sort: '-views', maxResults: 15
    });
    return { rows: res.data.rows || [], error: null };
  } catch (err) {
    const error = formatYouTubeAnalyticsError(err);
    console.warn(`⚠️  YT Top Videos unavailable: ${error}`);
    return { rows: [], error };
  }
}

// Live data is returned directly from the analytics pipeline without writing Excel or cache files.

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Concurrency limit for parallel API insight fetching.
 * Facebook & Instagram Graph API allow up to ~200 req/s per token.
 * 10 concurrent requests is a safe, fast default; bump to 15-20 if you see no
 * rate-limit errors (HTTP 429) in the output.
 */
/**
 * parallelMap — like Promise.all but with a sliding concurrency window.
 * Processes `items` by calling `fn(item, index)` with at most `limit`
 * in-flight at a time. Order of results mirrors order of input.
 */
async function parallelMap(items, fn, limit = FETCH_CONCURRENCY) {
  const results = new Array(items.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      results[i] = await fn(items[i], i);
    }
  }

  // Launch `limit` workers simultaneously; each drains the shared queue.
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

function getDateRange(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

// ─── Shape data for the dashboard ───────────────────────────────────────────
function shapeDashboardPayload({ fbData, igData, gaData, ytData, liData = null, warnings } = {}) {
  const payload = {
    fetchedAt: new Date().toISOString(),
    warnings,
    summary: {},
    GA4_DAILY: [],
    GA4_CHANNELS: [],
    GA4_PAGES: [],
    FB_POSTS: [],
    IG_POSTS: [],
    YT_VIDEOS: [],
    LI_DAILY: [],
    LI_PAGES: [],
    LI_SOCIAL_CHANNELS: [],
    LI_DEVICES: []
  };

  // GA4 daily rows
  if (gaData?.metrics?.length) {
    payload.GA4_DAILY = gaData.metrics.map(row => ({
      date: row.dimensionValues[0].value.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      users: +row.metricValues[0].value,
      newUsers: +row.metricValues[1].value,
      sessions: +row.metricValues[2].value,
      views: +row.metricValues[3].value,
      bounceRate: +parseFloat(row.metricValues[4].value).toFixed(2),
      dur: +parseFloat(row.metricValues[5].value).toFixed(1),
      conversions: +row.metricValues[6].value
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  // GA4 channels
  if (gaData?.traffic?.length) {
    payload.GA4_CHANNELS = gaData.traffic.map(r => ({
      channel: r.dimensionValues[0].value,
      sessions: +r.metricValues[0].value
    }));
  }

  // GA4 top pages — this was previously computed (getGA4TopPages) but never
  // attached to the dashboard payload, so the "Top Pages" tables in the
  // Overview and Google Analytics tabs always rendered empty.
  if (gaData?.pages?.length) {
    payload.GA4_PAGES = gaData.pages.map(r => ({
      path: r.dimensionValues[0].value,
      title: r.dimensionValues[1].value,
      views: +r.metricValues[0].value,
      duration: +parseFloat(r.metricValues[1].value).toFixed(1)
    }));
  }

  // Facebook posts
  if (fbData?.posts?.length) {
    payload.FB_POSTS = fbData.posts;
    payload.summary.fbFans = fbData.pageInfo?.fan_count || 0;
    payload.summary.fbFollowers = fbData.pageInfo?.followers_count || 0;
  }

  // Instagram posts
  if (igData?.posts?.length) {
    payload.IG_POSTS = igData.posts;
    payload.summary.igFollowers = igData.accountInfo?.followers_count || 0;
    payload.summary.igFollowing = igData.accountInfo?.follows_count || 0;
    payload.summary.igMediaCount = igData.accountInfo?.media_count || 0;
  }

  // YouTube videos
  if (ytData?.allVideos?.length) {
    payload.YT_VIDEOS = ytData.allVideos;
    payload.summary.ytSubscribers = +(ytData.channel?.statistics?.subscriberCount || 0);
    payload.summary.ytTotalViews = +(ytData.channel?.statistics?.viewCount || 0);
    payload.summary.ytTotalVideos = +(ytData.channel?.statistics?.videoCount || 0);
    payload.summary.ytPublishedAt = ytData.channel?.snippet?.publishedAt?.slice(0, 10) || '';
  }

  // LinkedIn (via GA4) — daily traffic from linkedin.com
  if (liData?.daily?.length) {
    payload.LI_DAILY = liData.daily.map(row => ({
      date: row.dimensionValues[0].value.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      sessions: +row.metricValues[0].value,
      users: +row.metricValues[1].value,
      newUsers: +row.metricValues[2].value,
      views: +row.metricValues[3].value,
      dur: +parseFloat(row.metricValues[4].value).toFixed(1),
      bounceRate: +parseFloat(row.metricValues[5].value).toFixed(2),
      conversions: +row.metricValues[6].value
    })).sort((a, b) => a.date.localeCompare(b.date));
    const totSess = payload.LI_DAILY.reduce((s, d) => s + d.sessions, 0);
    const totUsers = payload.LI_DAILY.reduce((s, d) => s + d.users, 0);
    const totViews = payload.LI_DAILY.reduce((s, d) => s + d.views, 0);
    const totConv = payload.LI_DAILY.reduce((s, d) => s + d.conversions, 0);
    const avgDur = payload.LI_DAILY.length ? (payload.LI_DAILY.reduce((s, d) => s + d.dur, 0) / payload.LI_DAILY.length).toFixed(1) : 0;
    payload.summary.liSessions = totSess;
    payload.summary.liUsers = totUsers;
    payload.summary.liViews = totViews;
    payload.summary.liConversions = totConv;
    payload.summary.liAvgDur = +avgDur;
  }

  if (liData?.pages?.length) {
    payload.LI_PAGES = liData.pages.map(r => ({
      path: r.dimensionValues[0].value,
      title: r.dimensionValues[1].value,
      sessions: +r.metricValues[0].value,
      views: +r.metricValues[1].value,
      duration: +parseFloat(r.metricValues[2].value).toFixed(1)
    }));
  }

  if (liData?.socialChannels?.length) {
    payload.LI_SOCIAL_CHANNELS = liData.socialChannels.map(r => ({
      source: r.dimensionValues[0].value,
      sessions: +r.metricValues[0].value,
      users: +r.metricValues[1].value,
      views: +r.metricValues[2].value
    }));
  }

  if (liData?.devices?.length) {
    payload.LI_DEVICES = liData.devices.map(r => ({
      device: r.dimensionValues[0].value,
      sessions: +r.metricValues[0].value,
      users: +r.metricValues[1].value
    }));
  }

  return payload;
}

// ─── Main export ─────────────────────────────────────────────────────────────
const GA4_DIMENSION_MAP = {
  country: 'country',
  region: 'region',
  city: 'city',
  continent: 'continent',
  sessionSource: 'sessionSource',
  sessionMedium: 'sessionMedium',
  sessionSourceMedium: 'sessionSourceMedium',
  sessionCampaignName: 'sessionCampaignName',
  sessionDefaultChannelGroup: 'sessionDefaultChannelGroup',
  deviceCategory: 'deviceCategory',
  operatingSystem: 'operatingSystem',
  browser: 'browser',
  platform: 'platform'
};

export async function getGA4DimensionValues(dimensionKey, startDate = '90daysAgo', endDate = 'today') {
  initGoogle();
  if (!analyticsData || !NORMALIZED_GA_PROPERTY_ID) {
    throw new Error('GA4 not configured — check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GA_PROPERTY_ID in .env');
  }
  const fieldName = GA4_DIMENSION_MAP[dimensionKey] || dimensionKey;
  try {
    const res = await analyticsData.properties.runReport({
      property: `properties/${NORMALIZED_GA_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: fieldName }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 250
      }
    });
    const rows = res.data.rows || [];
    return rows.map(r => ({
      value: r.dimensionValues[0]?.value || '(not set)',
      count: +r.metricValues[0]?.value || 0
    })).filter(item => item.value && item.value !== '(not set)');
  } catch (err) {
    console.error(`❌ GA4 dimension values error (${dimensionKey}):`, err.message);
    throw err;
  }
}

function buildGA4DimensionFilter(filters) {
  if (!filters || typeof filters !== 'object') return null;

  const expressions = [];

  for (const [key, rawValues] of Object.entries(filters)) {
    const fieldName = GA4_DIMENSION_MAP[key] || key;
    const values = Array.isArray(rawValues) ? rawValues.filter(Boolean) : (rawValues ? [rawValues] : []);
    if (values.length === 0) continue;

    if (values.length === 1) {
      expressions.push({
        filter: {
          fieldName,
          stringFilter: {
            matchType: 'EXACT',
            value: values[0],
            caseSensitive: false
          }
        }
      });
    } else {
      expressions.push({
        filter: {
          fieldName,
          inListFilter: {
            values: values,
            caseSensitive: false
          }
        }
      });
    }
  }

  if (expressions.length === 0) return null;
  if (expressions.length === 1) return expressions[0];
  return {
    andGroup: {
      expressions
    }
  };
}

export async function getFilteredGA4Data(filters = {}, startDate = '90daysAgo', endDate = 'today') {
  initGoogle();
  if (!analyticsData || !NORMALIZED_GA_PROPERTY_ID) {
    throw new Error('GA4 not configured — check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GA_PROPERTY_ID in .env');
  }

  const dimensionFilter = buildGA4DimensionFilter(filters);

  // Extract active filter dimensions to include as secondary dimensions if present
  const activeFilterKeys = Object.keys(filters).filter(k => filters[k] && (Array.isArray(filters[k]) ? filters[k].length > 0 : Boolean(filters[k])));
  const primarySecondaryDimKey = activeFilterKeys.length > 0 ? (GA4_DIMENSION_MAP[activeFilterKeys[0]] || activeFilterKeys[0]) : null;

  const pageDimensions = [{ name: 'pagePath' }, { name: 'pageTitle' }];
  if (primarySecondaryDimKey && primarySecondaryDimKey !== 'pagePath' && primarySecondaryDimKey !== 'pageTitle') {
    pageDimensions.push({ name: primarySecondaryDimKey });
  }

  const requestBodyMetrics = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' },
      { name: 'screenPageViews' }, { name: 'bounceRate' },
      { name: 'averageSessionDuration' }, { name: 'conversions' }
    ],
    ...(dimensionFilter ? { dimensionFilter } : {})
  };

  const requestBodyTraffic = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
    ...(dimensionFilter ? { dimensionFilter } : {})
  };

  const requestBodyPages = {
    dateRanges: [{ startDate: '365daysAgo', endDate: 'today' }],
    dimensions: pageDimensions,
    metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 15,
    ...(dimensionFilter ? { dimensionFilter } : {})
  };

  const requestBodyCountries = {
    dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 15,
    ...(dimensionFilter ? { dimensionFilter } : {})
  };

  const [metricsRes, trafficRes, pagesRes, countriesRes] = await Promise.all([
    analyticsData.properties.runReport({ property: `properties/${NORMALIZED_GA_PROPERTY_ID}`, requestBody: requestBodyMetrics }).catch(err => { console.error('❌ Filtered GA4 metrics:', err.message); return { data: {} }; }),
    analyticsData.properties.runReport({ property: `properties/${NORMALIZED_GA_PROPERTY_ID}`, requestBody: requestBodyTraffic }).catch(err => { console.error('❌ Filtered GA4 traffic:', err.message); return { data: {} }; }),
    analyticsData.properties.runReport({ property: `properties/${NORMALIZED_GA_PROPERTY_ID}`, requestBody: requestBodyPages }).catch(err => { console.error('❌ Filtered GA4 pages:', err.message); return { data: {} }; }),
    analyticsData.properties.runReport({ property: `properties/${NORMALIZED_GA_PROPERTY_ID}`, requestBody: requestBodyCountries }).catch(err => { console.error('❌ Filtered GA4 countries:', err.message); return { data: {} }; })
  ]);

  const metricsRows = metricsRes.data?.rows || [];
  const trafficRows = trafficRes.data?.rows || [];
  const pagesRows = pagesRes.data?.rows || [];
  const countriesRows = countriesRes.data?.rows || [];

  const GA4_DAILY = metricsRows.map(row => ({
    date: row.dimensionValues[0].value.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
    users: +row.metricValues[0].value,
    newUsers: +row.metricValues[1].value,
    sessions: +row.metricValues[2].value,
    views: +row.metricValues[3].value,
    bounceRate: +parseFloat(row.metricValues[4].value).toFixed(2),
    dur: +parseFloat(row.metricValues[5].value).toFixed(1),
    conversions: +row.metricValues[6].value
  })).sort((a, b) => a.date.localeCompare(b.date));

  const GA4_CHANNELS = trafficRows.map(r => ({
    channel: r.dimensionValues[0].value,
    sessions: +r.metricValues[0].value
  }));

  const GA4_PAGES = pagesRows.map(r => ({
    path: r.dimensionValues[0]?.value || '',
    title: r.dimensionValues[1]?.value || '',
    secondaryDimKey: activeFilterKeys[0] || null,
    secondaryDimVal: primarySecondaryDimKey && r.dimensionValues[2] ? r.dimensionValues[2].value : (activeFilterKeys.length > 0 && Array.isArray(filters[activeFilterKeys[0]]) ? filters[activeFilterKeys[0]].join(', ') : null),
    views: +r.metricValues[0]?.value || 0,
    duration: +parseFloat(r.metricValues[1]?.value || 0).toFixed(1)
  }));

  const GA4_COUNTRIES = countriesRows.map(r => ({
    country: r.dimensionValues[0].value,
    views: +r.metricValues[0].value
  }));

  return {
    GA4_DAILY,
    GA4_CHANNELS,
    GA4_PAGES,
    GA4_COUNTRIES
  };
}

/**
 * Fetches the top 15 countries by page views (all-time) from the GA4 property.
 * Reuses the same OAuth client and property ID as runAnalytics().
 * Returns an array of { country, views } objects, sorted descending by views.
 */
export async function runGA4Countries() {
  initGoogle();
  if (!analyticsData || !NORMALIZED_GA_PROPERTY_ID) {
    throw new Error('GA4 not configured — check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GA_PROPERTY_ID in .env');
  }
  const rows = await getGA4TopCountries();
  return rows.map(r => ({
    country: r.dimensionValues[0].value,
    views: +r.metricValues[0].value
  }));
}

export async function runAnalytics() {
  initGoogle();

  const warnings = [];
  let fbData = null, igData = null, gaData = null, ytData = null, liData = null;

  // ── Facebook + Instagram (run in parallel with each other) ──
  const fbEnabled = PAGE_ID && ACCESS_TOKEN;
  const igEnabled = IG_USER_ID && ACCESS_TOKEN;

  const [fbResult, igResult] = await Promise.all([
    // ─── Facebook ───
    fbEnabled
      ? (async () => {
        console.log('\n─── Facebook ───');
        await getPageToken();
        const [pageInfo, pageInsights] = await Promise.all([
          fetchFbPageInfo(),
          fetchFbPageInsights()
        ]);
        const rawPosts = await fetchFbAllPosts();
        const posts = processFbPosts(rawPosts);
        const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
        const totalComments = posts.reduce((s, p) => s + p.comments, 0);
        const totalShares = posts.reduce((s, p) => s + p.shares, 0);
        return { pageInfo, kpis: { totalPosts: posts.length, totalLikes, totalComments, totalShares, ...pageInsights, avgEngagementRate: 0 }, posts };
      })()
        .catch(err => { warnings.push(`FB: ${err.message}`); console.error('⚠️  FB skipped:', err.message); return null; })
      : Promise.resolve(null).then(() => { warnings.push('FB skipped: PAGE_ID or ACCESS_TOKEN missing'); return null; }),

    // ─── Instagram ───
    igEnabled
      ? (async () => {
        console.log('\n─── Instagram ───');
        const [accountInfo, accountInsights, audience, rawMedia] = await Promise.all([
          fetchIgAccountInfo(),
          fetchIgAccountInsights(),
          fetchIgAudienceInsights(),
          fetchIgAllMedia()
        ]);
        const posts = processIgMedia(rawMedia);
        const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
        const totalComments = posts.reduce((s, p) => s + p.comments, 0);
        return { accountInfo, kpis: { totalPosts: posts.length, totalLikes, totalComments, ...accountInsights, avgEngagementRate: 0 }, posts, audience };
      })()
        .catch(err => { warnings.push(`IG: ${err.message}`); console.error('⚠️  IG skipped:', err.message); return null; })
      : Promise.resolve(null).then(() => { warnings.push('IG skipped: IG_USER_ID or ACCESS_TOKEN missing'); return null; })
  ]);

  fbData = fbResult;
  igData = igResult;

  // ── GA4 ──
  if (NORMALIZED_GA_PROPERTY_ID && analyticsData) {
    try {
      console.log('\n─── Google Analytics 4 ───');
      const [metrics, traffic, pages] = await Promise.all([
        getGA4Metrics('90daysAgo', 'today'),
        getGA4TrafficSources('90daysAgo', 'today'),
        getGA4TopPages('365daysAgo', 'today')
      ]);
      gaData = { metrics, traffic, pages };
    } catch (err) { warnings.push(`GA4: ${err.message}`); console.error('⚠️  GA4 skipped:', err.message); }
  } else { warnings.push('GA4 skipped: missing property ID or OAuth'); }

  // LinkedIn data removed

  // ── YouTube ──
  if (YOUTUBE_CHANNEL_HANDLE && oauth2Client) {
    try {
      console.log('\n─── YouTube ───');
      const { startDate, endDate } = getDateRange(90);
      const channelId = await getYouTubeChannelId();
      const channel = await getYouTubePublicStats(channelId);
      const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
      const allVideos = uploadsPlaylistId ? await fetchYouTubeAllVideos(uploadsPlaylistId) : [];
      const [analyticsResult, topVideosResult] = await Promise.all([
        getYouTubeAnalytics(channelId, startDate, endDate),
        getYouTubeTopVideos(channelId, startDate, endDate)
      ]);
      const ytWarnings = [analyticsResult.error, topVideosResult.error].filter(Boolean);
      ytWarnings.forEach(message => warnings.push(`YT: ${message}`));
      ytData = { channel, analytics: analyticsResult.rows, topVideos: topVideosResult.rows, allVideos };
    } catch (err) { warnings.push(`YT: ${err.message}`); console.error('⚠️  YT skipped:', err.message); }
  } else { warnings.push('YT skipped: missing channel handle or OAuth'); }

  return shapeDashboardPayload({ fbData, igData, gaData, ytData, liData: liData ?? null, warnings });
}
