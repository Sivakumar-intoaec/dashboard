/**
 * IntoAEC — Google Search Console Fetcher
 * Pulls organic search data from the Search Console API v1.
 * Reuses the same Google OAuth2 credentials configured in .env.
 *
 * Exports:
 *   runGSC()           → full site overview (90 days)
 *   listSites()        → diagnostic: list all verified SC properties
 */

import dotenv from 'dotenv';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import axios from 'axios';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeEnvValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^['\"]|['\"]$/g, '');
}

const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, normalizeEnvValue(v)])
);

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  GSC_SITE_URL,
  CRUX_API_KEY
} = rawEnv;

// ─── Date helpers ─────────────────────────────────────────────────────────────
function isoDate(d) { return d.toISOString().slice(0, 10); }

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

// ─── OAuth init ───────────────────────────────────────────────────────────────
function buildOAuthClient() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN ||
    GOOGLE_REFRESH_TOKEN === 'your-refresh-token-here') {
    throw new Error('Google OAuth credentials not configured in .env');
  }
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return client;
}

// ─── GSC Query helper ────────────────────────────────────────────────────────
async function queryGSC(sc, siteUrl, body) {
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: body
  });
  return res.data.rows || [];
}

// ─── Fetchers (used by runGSC overview) ───────────────────────────────────────

/** Daily clicks + impressions + ctr + position */
async function fetchDailyPerformance(sc, siteUrl, startDate, endDate) {
  try {
    const rows = await queryGSC(sc, siteUrl, {
      startDate, endDate,
      dimensions: ['date'],
      rowLimit: 500
    });
    return rows.map(r => ({
      date: r.keys[0],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(2),
      position: +(r.position || 0).toFixed(1)
    })).sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error('❌ GSC daily performance:', err.message);
    throw err;
  }
}

/** Top N queries by clicks */
async function fetchTopQueries(sc, siteUrl, startDate, endDate, limit = 100) {
  try {
    const rows = await queryGSC(sc, siteUrl, {
      startDate, endDate,
      dimensions: ['query'],
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
      rowLimit: limit
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      query: r.keys[0],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(2),
      position: +(r.position || 0).toFixed(1)
    }));
  } catch (err) {
    console.error('❌ GSC top queries:', err.message);
    throw err;
  }
}

/** Top N pages by clicks */
async function fetchTopPages(sc, siteUrl, startDate, endDate, limit = 15) {
  try {
    const rows = await queryGSC(sc, siteUrl, {
      startDate, endDate,
      dimensions: ['page'],
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
      rowLimit: limit
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      page: r.keys[0],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(2),
      position: +(r.position || 0).toFixed(1)
    }));
  } catch (err) {
    console.error('❌ GSC top pages:', err.message);
    throw err;
  }
}

/** Device breakdown: DESKTOP / MOBILE / TABLET */
async function fetchDeviceBreakdown(sc, siteUrl, startDate, endDate) {
  try {
    const rows = await queryGSC(sc, siteUrl, {
      startDate, endDate,
      dimensions: ['device'],
      rowLimit: 10
    });
    return rows.map(r => ({
      device: r.keys[0],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(2),
      position: +(r.position || 0).toFixed(1)
    }));
  } catch (err) {
    console.error('❌ GSC device breakdown:', err.message);
    throw err;
  }
}

/** Top 10 countries by clicks */
async function fetchCountryBreakdown(sc, siteUrl, startDate, endDate) {
  try {
    const rows = await queryGSC(sc, siteUrl, {
      startDate, endDate,
      dimensions: ['country'],
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
      rowLimit: 10
    });
    return rows.map(r => ({
      country: r.keys[0].toUpperCase(),
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(2),
      position: +(r.position || 0).toFixed(1)
    }));
  } catch (err) {
    console.error('❌ GSC country breakdown:', err.message);
    throw err;
  }
}

// ─── Error mapper ─────────────────────────────────────────────────────────────
function handleGSCError(err) {
  const status = err?.response?.status;
  const errMsg = err?.message || '';
  
  if (status === 401 || errMsg.includes('invalid_grant') || errMsg.includes('credentials') || errMsg.includes('token')) {
    return new Error('Google authorization has expired or is invalid. Please renew Google authorization in .env.');
  }
  if (status === 403) {
    return new Error('Access denied. Verify that your Google account has permission to access the requested site in Google Search Console.');
  }
  if (status === 404) {
    return new Error('Search Console property not found. Verify the site URL is verified in your account.');
  }
  if (status === 429) {
    return new Error('Google API rate limit exceeded. Please try again later.');
  }
  return new Error(`Google API error: ${errMsg}`);
}

// ─── Main site overview export ────────────────────────────────────────────────
export async function runGSC(customSiteUrl, startDate, endDate) {
  const siteUrl = customSiteUrl || GSC_SITE_URL;
  if (!siteUrl) {
    throw new Error('No Search Console site URL specified. Please configure GSC_SITE_URL in .env or select a property.');
  }

  const finalStartDate = startDate || daysAgo(90);
  const finalEndDate = endDate || isoDate(new Date());

  console.log('\n─── Google Search Console ───');
  console.log(`   Site URL: ${siteUrl}`);
  console.log(`   Range   : ${finalStartDate} to ${finalEndDate}`);

  const auth = buildOAuthClient();
  try {
    await auth.getAccessToken();
  } catch (err) {
    throw handleGSCError(err);
  }

  const sc = google.searchconsole({ version: 'v1', auth });

  try {
    const [daily, queries, pages, devices, countries] = await Promise.all([
      fetchDailyPerformance(sc, siteUrl, finalStartDate, finalEndDate),
      fetchTopQueries(sc, siteUrl, finalStartDate, finalEndDate, 100),
      fetchTopPages(sc, siteUrl, finalStartDate, finalEndDate, 15),
      fetchDeviceBreakdown(sc, siteUrl, finalStartDate, finalEndDate),
      fetchCountryBreakdown(sc, siteUrl, finalStartDate, finalEndDate)
    ]);

    // Aggregate summary KPIs from daily rows
    const totalClicks = daily.reduce((s, d) => s + d.clicks, 0);
    const totalImpressions = daily.reduce((s, d) => s + d.impressions, 0);
    const avgCTR = daily.length
      ? +((daily.reduce((s, d) => s + d.ctr, 0) / daily.length).toFixed(2))
      : 0;
    const avgPosition = daily.length
      ? +((daily.reduce((s, d) => s + d.position, 0) / daily.length).toFixed(1))
      : 0;

    console.log(`✅ GSC: ${totalClicks} clicks · ${totalImpressions} impressions · ${avgCTR}% CTR · pos ${avgPosition}`);

    return {
      fetchedAt: new Date().toISOString(),
      siteUrl,
      dateRange: { startDate: finalStartDate, endDate: finalEndDate },
      summary: { totalClicks, totalImpressions, avgCTR, avgPosition },
      daily,
      queries,
      pages,
      devices,
      countries
    };
  } catch (err) {
    throw handleGSCError(err);
  }
}

// ─── Diagnostic: list all verified Search Console properties ──────────────────
export async function listSites() {
  const auth = buildOAuthClient();
  const sc = google.searchconsole({ version: 'v1', auth });
  try {
    const res = await sc.sites.list();
    return (res.data.siteEntry || []).map(s => ({
      siteUrl: s.siteUrl,
      permissionLevel: s.permissionLevel
    }));
  } catch (err) {
    throw handleGSCError(err);
  }
}

// ─── URL Inspection helpers ───────────────────────────────────────────────────
const indexingCache = new Map();

async function limitConcurrency(tasks, limit) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

export async function inspectUrl(sc, siteUrl, inspectionUrl) {
  const res = await sc.urlInspection.index.inspect({
    requestBody: {
      siteUrl,
      inspectionUrl
    }
  });
  const result = res.data.inspectionResult?.indexStatusResult || {};
  return {
    url: inspectionUrl,
    verdict: result.verdict || null,
    indexingState: result.indexingState || null,
    coverageState: result.coverageState || null,
    robotsTxtState: result.robotsTxtState || null,
    pageFetchState: result.pageFetchState || null,
    lastCrawlTime: result.lastCrawlTime || null,
    googleCanonical: result.googleCanonical || null,
    userCanonical: result.userCanonical || null
  };
}

export async function runIndexingStatus(customSiteUrl, pageUrls, forceRefresh = false) {
  const siteUrl = customSiteUrl || GSC_SITE_URL;
  if (!siteUrl) {
    throw new Error('No Search Console site URL specified. Please configure GSC_SITE_URL in .env or select a property.');
  }

  const auth = buildOAuthClient();
  try {
    await auth.getAccessToken();
  } catch (err) {
    throw handleGSCError(err);
  }

  const sc = google.searchconsole({ version: 'v1', auth });

  const ttlMin = Number(process.env.GSC_INDEXING_CACHE_TTL_MINUTES) || 30;
  const cacheTTL = ttlMin * 60 * 1000;
  const concurrencyLimit = Number(process.env.GSC_INDEXING_CONCURRENCY) || 5;

  const now = Date.now();

  const tasks = pageUrls.map(url => async () => {
    if (!forceRefresh) {
      const cached = indexingCache.get(url);
      if (cached && (now - cached.timestamp < cacheTTL)) {
        return { url, indexing: cached.data };
      }
    }

    try {
      const result = await inspectUrl(sc, siteUrl, url);
      let status = 'UNKNOWN';
      if (result.verdict === 'PASS') {
        status = 'INDEXED';
      } else if (result.verdict === 'FAIL' || result.verdict === 'NEUTRAL') {
        status = 'NOT_INDEXED';
      }

      const indexingData = {
        status,
        verdict: result.verdict,
        coverageState: result.coverageState,
        lastCrawlTime: result.lastCrawlTime,
        indexingState: result.indexingState,
        robotsTxtState: result.robotsTxtState,
        pageFetchState: result.pageFetchState,
        googleCanonical: result.googleCanonical,
        userCanonical: result.userCanonical
      };

      indexingCache.set(url, { timestamp: now, data: indexingData });
      return { url, indexing: indexingData };
    } catch (err) {
      const errorData = {
        status: 'INSPECTION_ERROR',
        message: err.message || 'Unable to inspect this URL'
      };
      return { url, indexing: errorData };
    }
  });

  const results = await limitConcurrency(tasks, concurrencyLimit);
  
  const indexingMap = {};
  for (const item of results) {
    indexingMap[item.url] = item.indexing;
  }
  return indexingMap;
}

// ─── GSC Indexing Persistent JSON Store ──────────────────────────────────────
const DB_FILE = path.join(__dirname, 'gsc_url_inspections.json');
let dbWritePromise = Promise.resolve();

async function initDb() {
  try {
    await fs.access(DB_FILE);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(DB_FILE, JSON.stringify({ pages: {} }, null, 2), 'utf8');
    }
  }
}

async function readDb() {
  await initDb();
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading indexing DB, returning empty:', err.message);
    return { pages: {} };
  }
}

async function writeDb(db) {
  dbWritePromise = dbWritePromise.then(async () => {
    try {
      await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
      console.error('Error writing indexing DB:', err.message);
    }
  });
  return dbWritePromise;
}

// ─── Sitemap Crawling and Parsing Helpers ────────────────────────────────────
function getBaseUrl(siteUrl) {
  if (siteUrl.startsWith('sc-domain:')) {
    return `https://${siteUrl.substring(10)}`;
  }
  return siteUrl;
}

export function isUrlInProperty(urlStr, siteUrl) {
  try {
    const url = new URL(urlStr);
    if (siteUrl.startsWith('sc-domain:')) {
      const domain = siteUrl.substring(10).toLowerCase();
      const hostname = url.hostname.toLowerCase();
      return hostname === domain || hostname.endsWith('.' + domain);
    } else {
      const prefix = siteUrl.toLowerCase();
      return urlStr.toLowerCase().startsWith(prefix);
    }
  } catch (e) {
    return false;
  }
}

export function normalizeUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.toString();
  } catch (e) {
    return urlStr;
  }
}

function cleanAndFilterUrls(rawUrls, siteUrl) {
  const seen = new Set();
  const filtered = [];
  for (const rawUrl of rawUrls) {
    try {
      const normalized = normalizeUrl(rawUrl);
      if (isUrlInProperty(normalized, siteUrl)) {
        if (!seen.has(normalized)) {
          seen.add(normalized);
          filtered.push(normalized);
        }
      }
    } catch (e) {
      // Ignore invalid URL
    }
  }
  return filtered;
}

async function parseSitemapXml(sitemapUrl, visited = new Set()) {
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  try {
    console.log(`[Sitemap] Fetching: ${sitemapUrl}`);
    const response = await axios.get(sitemapUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const xml = response.data;
    if (typeof xml !== 'string') return [];

    const locRegex = /<loc>\s*(<!\[CDATA\[)?(.*?)(]]>)?\s*<\/loc>/gi;
    let match;
    const urls = [];
    while ((match = locRegex.exec(xml)) !== null) {
      const url = match[2].trim();
      if (url) urls.push(url);
    }

    const isIndex = /<sitemapindex/i.test(xml) || (/<sitemap>/i.test(xml) && !/<url>/i.test(xml));
    
    if (isIndex) {
      console.log(`[Sitemap Index] Found ${urls.length} sitemaps in index: ${sitemapUrl}`);
      const allNestedUrls = [];
      for (const nestedSitemap of urls) {
        const nestedUrls = await parseSitemapXml(nestedSitemap, visited);
        allNestedUrls.push(...nestedUrls);
      }
      return allNestedUrls;
    } else {
      console.log(`[Sitemap] Found ${urls.length} URLs in sitemap: ${sitemapUrl}`);
      return urls;
    }
  } catch (err) {
    console.error(`[Sitemap] Error fetching/parsing ${sitemapUrl}:`, err.message);
    return [];
  }
}

export async function getSitemapUrlsForProperty(siteUrl) {
  try {
    const auth = buildOAuthClient();
    const sc = google.searchconsole({ version: 'v1', auth });
    console.log(`[Sitemaps API] Fetching sitemaps list for property: ${siteUrl}`);
    const res = await sc.sitemaps.list({ siteUrl });
    const sitemaps = res.data.sitemap || [];
    if (sitemaps.length > 0) {
      const allUrls = [];
      const visited = new Set();
      for (const sm of sitemaps) {
        if (sm.path) {
          const urls = await parseSitemapXml(sm.path, visited);
          allUrls.push(...urls);
        }
      }
      const cleanUrls = cleanAndFilterUrls(allUrls, siteUrl);
      if (cleanUrls.length > 0) {
        return cleanUrls;
      }
    }
  } catch (err) {
    console.warn(`[Sitemaps API] Failed to list sitemaps for ${siteUrl}:`, err.message);
  }

  const baseUrl = getBaseUrl(siteUrl);
  const defaultSitemap = `${baseUrl.replace(/\/$/, '')}/sitemap.xml`;
  console.log(`[Sitemaps Fallback] Querying default sitemap path: ${defaultSitemap}`);
  const urls = await parseSitemapXml(defaultSitemap);
  return cleanAndFilterUrls(urls, siteUrl);
}

// ─── GSC Indexing Background Job Engine ──────────────────────────────────────
export const activeScans = new Map();
const lastSitemapSync = new Map();

export async function getIndexingData(customSiteUrl, options = {}) {
  const siteUrl = customSiteUrl || GSC_SITE_URL;
  if (!siteUrl) {
    throw new Error('No Search Console site URL specified.');
  }

  const page = options.page || 1;
  const pageSize = options.pageSize || 25;
  const statusFilter = options.status || null;
  const searchQuery = options.search || null;
  const forceRefresh = options.refresh === true;

  await initDb();

  const now = Date.now();
  const lastSync = lastSitemapSync.get(siteUrl) || 0;
  const oneHour = 60 * 60 * 1000;
  const needsSync = forceRefresh || (now - lastSync > oneHour);

  if (needsSync) {
    console.log(`[Indexing] Performing sitemap synchronization for ${siteUrl}`);
    try {
      const urls = await getSitemapUrlsForProperty(siteUrl);
      const db = await readDb();
      
      for (const key of Object.keys(db.pages)) {
        if (db.pages[key].siteUrl === siteUrl) {
          db.pages[key].inSitemap = false;
        }
      }

      for (const url of urls) {
        const key = `${siteUrl}::${url}`;
        if (!db.pages[key]) {
          db.pages[key] = {
            siteUrl,
            url,
            status: 'PENDING',
            reason: 'Pending Inspection',
            inSitemap: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        } else {
          db.pages[key].inSitemap = true;
        }
      }
      await writeDb(db);
      lastSitemapSync.set(siteUrl, now);
      console.log(`[Indexing] Sitemap sync complete. Discovered ${urls.length} URLs.`);
    } catch (err) {
      console.error(`[Indexing] Sitemap sync failed for ${siteUrl}:`, err.message);
    }
  }

  const db = await readDb();
  const allSitePages = Object.values(db.pages).filter(p => p.siteUrl === siteUrl && p.inSitemap);
  
  const cacheTTL = (Number(process.env.GSC_INDEXING_CACHE_TTL_MINUTES) || 60) * 60 * 1000;
  const pendingOrExpired = allSitePages.filter(p => {
    if (p.status === 'PENDING') return true;
    if (!p.inspectedAt) return true;
    const age = now - new Date(p.inspectedAt).getTime();
    return age > cacheTTL;
  });

  const currentScan = activeScans.get(siteUrl);
  if (forceRefresh || (pendingOrExpired.length > 0 && (!currentScan || currentScan.status !== 'running'))) {
    console.log(`[Indexing] Starting background scan for ${siteUrl}. Queue size: ${pendingOrExpired.length}`);
    startIndexingScan(siteUrl, forceRefresh);
  }

  const scanStatus = activeScans.get(siteUrl) || {
    status: 'idle',
    total: allSitePages.length,
    inspected: allSitePages.filter(p => p.status !== 'PENDING').length,
    pending: allSitePages.filter(p => p.status === 'PENDING').length,
    indexed: allSitePages.filter(p => p.status === 'INDEXED').length,
    notIndexed: allSitePages.filter(p => p.status === 'NOT_INDEXED').length,
    errors: allSitePages.filter(p => p.status === 'INSPECTION_ERROR').length,
    progress: 100
  };

  const summary = {
    totalPages: allSitePages.length,
    indexed: allSitePages.filter(p => p.status === 'INDEXED').length,
    notIndexed: allSitePages.filter(p => p.status === 'NOT_INDEXED').length,
    inspectionErrors: allSitePages.filter(p => p.status === 'INSPECTION_ERROR').length
  };

  let filteredPages = [...allSitePages];
  if (statusFilter && statusFilter !== 'ALL') {
    filteredPages = filteredPages.filter(p => p.status === statusFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredPages = filteredPages.filter(p => p.url.toLowerCase().includes(q));
  }

  const totalItems = filteredPages.length;
  const totalPagesAvailable = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedPages = filteredPages.slice(startIndex, startIndex + pageSize);

  return {
    success: true,
    data: {
      siteUrl,
      scan: scanStatus,
      summary,
      pages: paginatedPages,
      page,
      pageSize,
      totalPages: totalItems,
      totalPagesAvailable
    }
  };
}

export async function startIndexingScan(siteUrl, forceRefresh = false) {
  if (activeScans.get(siteUrl)?.status === 'running') {
    return activeScans.get(siteUrl);
  }

  const scanState = {
    status: 'running',
    total: 0,
    inspected: 0,
    pending: 0,
    indexed: 0,
    notIndexed: 0,
    errors: 0,
    progress: 0,
    startTime: Date.now()
  };
  activeScans.set(siteUrl, scanState);

  runScanInBackground(siteUrl, forceRefresh).catch(err => {
    console.error(`Error running background scan for ${siteUrl}:`, err);
    const current = activeScans.get(siteUrl);
    if (current) {
      current.status = 'idle';
      current.errorMessage = err.message;
    }
  });

  return scanState;
}

async function runScanInBackground(siteUrl, forceRefresh) {
  const db = await readDb();
  const allSitePages = Object.values(db.pages).filter(p => p.siteUrl === siteUrl && p.inSitemap);
  const cacheTTL = (Number(process.env.GSC_INDEXING_CACHE_TTL_MINUTES) || 60) * 60 * 1000;
  const now = Date.now();

  const queue = allSitePages.filter(p => {
    if (forceRefresh) return true;
    if (p.status === 'PENDING') return true;
    if (!p.inspectedAt) return true;
    const age = now - new Date(p.inspectedAt).getTime();
    return age > cacheTTL;
  });

  queue.sort((a, b) => {
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
    const timeA = a.inspectedAt ? new Date(a.inspectedAt).getTime() : 0;
    const timeB = b.inspectedAt ? new Date(b.inspectedAt).getTime() : 0;
    return timeA - timeB;
  });

  const maxInspections = Number(process.env.GSC_INDEXING_MAX_INSPECTIONS_PER_SCAN) || 2000;
  const scanQueue = queue.slice(0, maxInspections);

  const totalPages = allSitePages.length;
  let indexed = 0;
  let notIndexed = 0;
  let errors = 0;
  let pending = 0;

  for (const p of allSitePages) {
    if (scanQueue.some(sq => sq.url === p.url)) {
      pending++;
    } else {
      if (p.status === 'INDEXED') indexed++;
      else if (p.status === 'NOT_INDEXED') notIndexed++;
      else if (p.status === 'INSPECTION_ERROR') errors++;
      else pending++;
    }
  }

  const scanState = activeScans.get(siteUrl);
  scanState.total = totalPages;
  scanState.pending = pending;
  scanState.indexed = indexed;
  scanState.notIndexed = notIndexed;
  scanState.errors = errors;
  scanState.inspected = totalPages - pending;
  scanState.progress = totalPages > 0 ? Math.round((scanState.inspected / totalPages) * 100) : 100;

  if (scanQueue.length === 0) {
    scanState.status = 'idle';
    scanState.progress = 100;
    return;
  }

  const concurrency = Number(process.env.GSC_INDEXING_CONCURRENCY) || 5;
  const auth = buildOAuthClient();
  const sc = google.searchconsole({ version: 'v1', auth });

  const executeTask = async (pageRecord) => {
    try {
      const inspection = await inspectUrl(sc, siteUrl, pageRecord.url);
      
      let status = 'UNKNOWN';
      let reason = 'Reason unavailable';
      if (inspection.verdict === 'PASS') {
        status = 'INDEXED';
        reason = 'Indexed';
      } else if (inspection.verdict === 'FAIL' || inspection.verdict === 'NEUTRAL') {
        status = 'NOT_INDEXED';
        reason = inspection.coverageState || 'Not indexed';
      }

      pageRecord.status = status;
      pageRecord.reason = reason;
      pageRecord.verdict = inspection.verdict;
      pageRecord.coverageState = inspection.coverageState;
      pageRecord.indexingState = inspection.indexingState;
      pageRecord.robotsTxtState = inspection.robotsTxtState;
      pageRecord.pageFetchState = inspection.pageFetchState;
      pageRecord.lastCrawlTime = inspection.lastCrawlTime;
      pageRecord.googleCanonical = inspection.googleCanonical;
      pageRecord.userCanonical = inspection.userCanonical;
      pageRecord.inspectedAt = new Date().toISOString();
      pageRecord.updatedAt = new Date().toISOString();
      delete pageRecord.errorMessage;

      if (status === 'INDEXED') scanState.indexed++;
      else scanState.notIndexed++;

    } catch (err) {
      console.error(`[Background Scan] Error inspecting ${pageRecord.url}:`, err.message);
      pageRecord.status = 'INSPECTION_ERROR';
      pageRecord.reason = err.message || 'Unable to inspect URL';
      pageRecord.errorMessage = err.message;
      pageRecord.inspectedAt = new Date().toISOString();
      pageRecord.updatedAt = new Date().toISOString();

      scanState.errors++;
    } finally {
      scanState.pending--;
      scanState.inspected++;
      scanState.progress = totalPages > 0 ? Math.round((scanState.inspected / totalPages) * 100) : 100;

      const currentDb = await readDb();
      currentDb.pages[`${siteUrl}::${pageRecord.url}`] = pageRecord;
      await writeDb(currentDb);
    }
  };

  await limitConcurrency(
    scanQueue.map(pageRecord => () => executeTask(pageRecord)),
    concurrency
  );

  scanState.status = 'idle';
  scanState.progress = 100;
  console.log(`[Background Scan] Finished scan for ${siteUrl}`);
}

export async function inspectSingleUrl(siteUrl, url) {
  await initDb();
  const auth = buildOAuthClient();
  const sc = google.searchconsole({ version: 'v1', auth });

  console.log(`[Single Inspection] Inspecting URL: ${url}`);
  const inspection = await inspectUrl(sc, siteUrl, url);

  let status = 'UNKNOWN';
  let reason = 'Reason unavailable';
  if (inspection.verdict === 'PASS') {
    status = 'INDEXED';
    reason = 'Indexed';
  } else if (inspection.verdict === 'FAIL' || inspection.verdict === 'NEUTRAL') {
    status = 'NOT_INDEXED';
    reason = inspection.coverageState || 'Not indexed';
  }

  const pageRecord = {
    siteUrl,
    url,
    status,
    reason,
    verdict: inspection.verdict,
    coverageState: inspection.coverageState,
    indexingState: inspection.indexingState,
    robotsTxtState: inspection.robotsTxtState,
    pageFetchState: inspection.pageFetchState,
    lastCrawlTime: inspection.lastCrawlTime,
    googleCanonical: inspection.googleCanonical,
    userCanonical: inspection.userCanonical,
    inspectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    inSitemap: true
  };

  const currentDb = await readDb();
  if (currentDb.pages[`${siteUrl}::${url}`]) {
    pageRecord.inSitemap = currentDb.pages[`${siteUrl}::${url}`].inSitemap;
  }
  currentDb.pages[`${siteUrl}::${url}`] = pageRecord;
  await writeDb(currentDb);

  return pageRecord;
}

const urlInspectionCache = new Map();

export async function inspectSingleUrlWithCache(siteUrl, url, forceRefresh = false) {
  const normalized = normalizeUrl(url);
  const cacheKey = `url-inspection:${siteUrl}:${normalized}`;
  const now = Date.now();
  const cacheTTL = 30 * 60 * 1000; // 30 minutes
  
  if (!forceRefresh) {
    const cached = urlInspectionCache.get(cacheKey);
    if (cached && (now - cached.timestamp < cacheTTL)) {
      console.log(`[Cache Hit] Returning cached URL inspection for ${normalized}`);
      return cached.data;
    }
  }

  const pageRecord = await inspectSingleUrl(siteUrl, normalized);
  
  const normalizedData = {
    url: pageRecord.url,
    status: pageRecord.status,
    verdict: pageRecord.verdict || null,
    coverageState: pageRecord.coverageState || null,
    indexingState: pageRecord.indexingState || null,
    robotsTxtState: pageRecord.robotsTxtState || null,
    pageFetchState: pageRecord.pageFetchState || null,
    lastCrawlTime: pageRecord.lastCrawlTime || null,
    googleCanonical: pageRecord.googleCanonical || null,
    userCanonical: pageRecord.userCanonical || null
  };

  urlInspectionCache.set(cacheKey, {
    timestamp: now,
    data: normalizedData
  });

  return normalizedData;
}

export function mapUrlInspectionError(err) {
  const status = err?.response?.status;
  const errMsg = err?.message || '';
  
  if (status === 400 || errMsg.includes('400')) {
    return new Error('Invalid URL.');
  }
  if (status === 401 || errMsg.includes('invalid_grant') || errMsg.includes('credentials') || errMsg.includes('token') || errMsg.includes('401')) {
    return new Error('Google authorization has expired or is invalid. Please renew the Google Search Console authorization.');
  }
  if (status === 403 || errMsg.includes('403')) {
    return new Error('Access denied. The configured Google account does not have permission to inspect this Search Console property.');
  }
  if (status === 404 || errMsg.includes('404')) {
    return new Error('Search Console property was not found.');
  }
  if (status === 429 || errMsg.includes('429')) {
    return new Error('Google URL Inspection API quota has been exceeded. Please try again later.');
  }
  return new Error('Unable to inspect this URL right now. Please try again later.');
}

// ─── Core Web Vitals (CrUX API) ────────────────────────────────────────────────
const vitalsCache = new Map();
const VITALS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function fetchCoreWebVitals(targetUrl = null, device = 'mobile', forceRefresh = false) {
  let cleanUrl = targetUrl ? decodeURIComponent(targetUrl).trim() : (GSC_SITE_URL || 'https://intoaec.ai/');
  if (cleanUrl.startsWith('sc-domain:')) {
    cleanUrl = 'https://' + cleanUrl.replace('sc-domain:', '').trim();
  }
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  if (!cleanUrl.endsWith('/') && !cleanUrl.includes('?')) {
    cleanUrl += '/';
  }

  const formFactorMap = { mobile: 'PHONE', phone: 'PHONE', desktop: 'DESKTOP' };
  const formFactorKey = (device || 'mobile').toLowerCase();
  const cruxFormFactor = formFactorMap[formFactorKey] || 'PHONE';

  const cacheKey = `vitals:${cleanUrl}:${formFactorKey}`;
  const now = Date.now();

  if (!forceRefresh) {
    const cached = vitalsCache.get(cacheKey);
    if (cached && (now - cached.timestamp < VITALS_CACHE_TTL)) {
      console.log(`[Cache Hit] Returning cached Core Web Vitals for ${cacheKey}`);
      return cached.data;
    }
  }

  const endpoint = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
  let params = {};
  let headers = {};

  const apiKey = CRUX_API_KEY;
  if (!apiKey) {
    const noKeyResult = {
      success: true,
      data: {
        url: cleanUrl,
        device: formFactorKey,
        hasData: false,
        overall: 'NO_DATA',
        overallText: 'No Core Web Vitals data available (CRUX_API_KEY not configured in .env)',
        metrics: null,
        fetchedAt: new Date().toISOString()
      }
    };
    vitalsCache.set(cacheKey, { timestamp: now, data: noKeyResult });
    return noKeyResult;
  }

  params.key = apiKey;

  let cruxData = null;
  try {
    const res = await axios.post(endpoint, {
      url: cleanUrl,
      formFactor: cruxFormFactor
    }, { params, headers });
    cruxData = res.data;
  } catch (err1) {
    const errMsg1 = err1.response?.data?.error?.message || err1.message;
    if (err1.response?.status === 403 && (errMsg1.includes('Chrome UX Report API') || errMsg1.includes('blocked'))) {
      const apiErrResult = {
        success: true,
        data: {
          url: cleanUrl,
          device: formFactorKey,
          hasData: false,
          overall: 'NO_DATA',
          overallText: 'No Core Web Vitals data available (Enable Chrome UX Report API in Google Cloud Console)',
          metrics: null,
          fetchedAt: new Date().toISOString()
        }
      };
      vitalsCache.set(cacheKey, { timestamp: now, data: apiErrResult });
      return apiErrResult;
    }
    // If URL query fails, try origin query as fallback
    try {
      const originUrl = new URL(cleanUrl).origin;
      const res = await axios.post(endpoint, {
        origin: originUrl,
        formFactor: cruxFormFactor
      }, { params, headers });
      cruxData = res.data;
    } catch (err2) {
      const errMsg2 = err2.response?.data?.error?.message || err2.message;
      console.log(`ℹ️ CrUX record not found for ${cleanUrl} (${cruxFormFactor}):`, errMsg2);
    }
  }

  if (!cruxData?.record?.metrics) {
    const noDataResult = {
      success: true,
      data: {
        url: cleanUrl,
        device: formFactorKey,
        hasData: false,
        overall: 'NO_DATA',
        overallText: 'No Core Web Vitals data available',
        metrics: null,
        fetchedAt: new Date().toISOString()
      }
    };
    vitalsCache.set(cacheKey, { timestamp: now, data: noDataResult });
    return noDataResult;
  }

  const metricsObj = cruxData.record.metrics;

  // LCP
  let lcp = null;
  if (metricsObj.largest_contentful_paint) {
    const p75 = +metricsObj.largest_contentful_paint.percentiles?.p75 || 0;
    const p75Sec = +(p75 / 1000).toFixed(1);
    let status = 'GOOD';
    let statusText = '✓ Good';
    if (p75 > 4000) { status = 'POOR'; statusText = '✗ Poor'; }
    else if (p75 > 2500) { status = 'NEEDS_IMPROVEMENT'; statusText = '⚠ Needs Improvement'; }

    const histo = metricsObj.largest_contentful_paint.histogram || [];
    const goodPct = histo[0] ? Math.round(histo[0].density * 100) : 0;
    const niPct = histo[1] ? Math.round(histo[1].density * 100) : 0;
    const poorPct = histo[2] ? Math.round(histo[2].density * 100) : 0;

    lcp = {
      name: 'LCP',
      title: 'Largest Contentful Paint',
      value: `${p75Sec} s`,
      p75: p75Sec,
      status,
      statusText,
      goodPct,
      needsImprovementPct: niPct,
      poorPct
    };
  }

  // INP
  let inp = null;
  if (metricsObj.interaction_to_next_paint) {
    const p75 = +metricsObj.interaction_to_next_paint.percentiles?.p75 || 0;
    let status = 'GOOD';
    let statusText = '✓ Good';
    if (p75 > 500) { status = 'POOR'; statusText = '✗ Poor'; }
    else if (p75 > 200) { status = 'NEEDS_IMPROVEMENT'; statusText = '⚠ Needs Improvement'; }

    const histo = metricsObj.interaction_to_next_paint.histogram || [];
    const goodPct = histo[0] ? Math.round(histo[0].density * 100) : 0;
    const niPct = histo[1] ? Math.round(histo[1].density * 100) : 0;
    const poorPct = histo[2] ? Math.round(histo[2].density * 100) : 0;

    inp = {
      name: 'INP',
      title: 'Interaction to Next Paint',
      value: `${p75} ms`,
      p75,
      status,
      statusText,
      goodPct,
      needsImprovementPct: niPct,
      poorPct
    };
  }

  // CLS
  let cls = null;
  if (metricsObj.cumulative_layout_shift) {
    const rawVal = metricsObj.cumulative_layout_shift.percentiles?.p75;
    const p75 = rawVal !== undefined ? parseFloat(rawVal) : 0;
    const p75Formatted = p75.toFixed(2);
    let status = 'GOOD';
    let statusText = '✓ Good';
    if (p75 > 0.25) { status = 'POOR'; statusText = '✗ Poor'; }
    else if (p75 > 0.10) { status = 'NEEDS_IMPROVEMENT'; statusText = '⚠ Needs Improvement'; }

    const histo = metricsObj.cumulative_layout_shift.histogram || [];
    const goodPct = histo[0] ? Math.round(histo[0].density * 100) : 0;
    const niPct = histo[1] ? Math.round(histo[1].density * 100) : 0;
    const poorPct = histo[2] ? Math.round(histo[2].density * 100) : 0;

    cls = {
      name: 'CLS',
      title: 'Cumulative Layout Shift',
      value: p75Formatted,
      p75: parseFloat(p75Formatted),
      status,
      statusText,
      goodPct,
      needsImprovementPct: niPct,
      poorPct
    };
  }

  // Overall status evaluation
  const metricStatuses = [lcp, inp, cls].filter(Boolean).map(m => m.status);
  let overall = 'GOOD';
  let overallText = '✓ Good';

  if (metricStatuses.includes('POOR')) {
    overall = 'POOR';
    overallText = '✗ Poor';
  } else if (metricStatuses.includes('NEEDS_IMPROVEMENT')) {
    overall = 'NEEDS_IMPROVEMENT';
    overallText = '⚠ Needs Improvement';
  }

  const cp = cruxData.record.collectionPeriod;
  let collectionPeriod = null;
  if (cp?.firstDate && cp?.lastDate) {
    collectionPeriod = {
      firstDate: `${cp.firstDate.year}-${String(cp.firstDate.month).padStart(2, '0')}-${String(cp.firstDate.day).padStart(2, '0')}`,
      lastDate: `${cp.lastDate.year}-${String(cp.lastDate.month).padStart(2, '0')}-${String(cp.lastDate.day).padStart(2, '0')}`
    };
  }

  const result = {
    success: true,
    data: {
      url: cleanUrl,
      device: formFactorKey,
      hasData: true,
      overall,
      overallText,
      metrics: { lcp, inp, cls },
      collectionPeriod,
      fetchedAt: new Date().toISOString()
    }
  };

  vitalsCache.set(cacheKey, { timestamp: now, data: result });
  return result;
}






