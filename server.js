/**
 * IntoAEC Analytics Dashboard - Express Server
 * Serves the dashboard HTML and exposes /api/data + /api/refresh
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAnalytics, runGA4Countries, getGA4DimensionValues, getFilteredGA4Data } from './analysis.js';
import { runGSC, listSites, runIndexingStatus, getIndexingData, inspectSingleUrl, inspectSingleUrlWithCache, isUrlInProperty, mapUrlInspectionError, fetchCoreWebVitals } from './gsc.js';
import { analyzePageSpeed } from './pagespeed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// GET /api/data
// Fetches fresh analytics data on demand and returns it directly.
app.get('/api/data', async (req, res) => {
    try {
        const payload = await runAnalytics();
        return res.json(payload);
    } catch (err) {
        console.error('Data fetch failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/refresh
// Fetches fresh analytics data and returns it without storing it.
app.post('/api/refresh', async (req, res) => {
    console.log('\nRefreshing dashboard live data...');
    try {
        const payload = await runAnalytics();
        console.log('Refresh complete.');
        return res.json(payload);
    } catch (err) {
        console.error('Refresh failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/countries
// Returns top 15 countries by page views (all-time) from the GA4 property.
// Reuses the same OAuth credentials and property ID as /api/data — no new auth required.
app.get('/api/analytics/countries', async (req, res) => {
    try {
        const rows = await runGA4Countries();
        return res.json({ data: rows });
    } catch (err) {
        console.error('Countries fetch failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/dimension-values
// Returns distinct available values from GA4 for a specified dimension (e.g. country, sessionSource, deviceCategory)
app.get('/api/analytics/dimension-values', async (req, res) => {
    const dimension = req.query.dimension;
    const startDate = req.query.startDate || '90daysAgo';
    const endDate = req.query.endDate || 'today';
    if (!dimension) {
        return res.status(400).json({ success: false, error: 'Dimension parameter is required' });
    }
    try {
        const values = await getGA4DimensionValues(dimension, startDate, endDate);
        return res.json({ success: true, data: values });
    } catch (err) {
        console.error(`Dimension values fetch failed (${dimension}):`, err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/analytics/filter
// Returns filtered GA4 dashboard metrics, charts, top pages, and country distribution
app.post('/api/analytics/filter', async (req, res) => {
    const filters = req.body.filters || {};
    const startDate = req.body.startDate || '90daysAgo';
    const endDate = req.body.endDate || 'today';
    try {
        const data = await getFilteredGA4Data(filters, startDate, endDate);
        return res.json({ success: true, data });
    } catch (err) {
        console.error('Filtered GA4 data fetch failed:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// In-memory cache for GSC data
const gscCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedData(key, forceRefresh) {
    if (forceRefresh) return null;
    const cached = gscCache.get(key);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data;
    }
    return null;
}

function setCachedData(key, data) {
    gscCache.set(key, {
        timestamp: Date.now(),
        data
    });
}

// GET /api/gsc
// Fetches Google Search Console data independently from the main analytics.
app.get('/api/gsc', async (req, res) => {
    const siteUrl = req.query.siteUrl ? decodeURIComponent(req.query.siteUrl) : null;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const forceRefresh = req.query.refresh === 'true';

    // Construct cache key
    const cacheKey = `site:${siteUrl}:${startDate}:${endDate}`;

    // Check cache
    const cached = getCachedData(cacheKey, forceRefresh);
    if (cached) {
        console.log(`[Cache Hit] Returning cached GSC data for ${cacheKey}`);
        return res.json(cached);
    }

    try {
        const payload = await runGSC(siteUrl, startDate, endDate);

        // Normalize response according to Step 14
        const normalized = {
            success: true,
            data: {
                siteUrl: payload.siteUrl,
                dateRange: payload.dateRange,
                clicks: payload.summary.totalClicks,
                impressions: payload.summary.totalImpressions,
                ctr: payload.summary.avgCTR,
                position: payload.summary.avgPosition,
                dailyPerformance: payload.daily,
                topQueries: payload.queries,
                topPages: payload.pages,
                countries: payload.countries,
                devices: payload.devices
            }
        };

        setCachedData(cacheKey, normalized);
        return res.json(normalized);
    } catch (err) {
        console.error('GSC fetch failed:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});


// GET /api/gsc/sites
// Diagnostic: lists all Search Console properties accessible to the OAuth account.
app.get('/api/gsc/sites', async (req, res) => {
    try {
        const sites = await listSites();
        return res.json({ sites });
    } catch (err) {
        console.error('GSC sites list failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/gsc/page-indexing
// Fetches Search Console page indexing statuses combined with page metrics.
app.get('/api/gsc/page-indexing', async (req, res) => {
    const siteUrl = req.query.siteUrl ? decodeURIComponent(req.query.siteUrl) : null;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const forceRefresh = req.query.refresh === 'true';

    try {
        const cacheKey = `site:${siteUrl}:${startDate}:${endDate}`;
        let payload;

        const cachedGSC = getCachedData(cacheKey, false);
        if (cachedGSC) {
            payload = cachedGSC.data;
        } else {
            const rawPayload = await runGSC(siteUrl, startDate, endDate);
            payload = {
                siteUrl: rawPayload.siteUrl,
                dateRange: rawPayload.dateRange,
                clicks: rawPayload.summary.totalClicks,
                impressions: rawPayload.summary.totalImpressions,
                ctr: rawPayload.summary.avgCTR,
                position: rawPayload.summary.avgPosition,
                dailyPerformance: rawPayload.daily,
                topQueries: rawPayload.queries,
                topPages: rawPayload.pages,
                countries: rawPayload.countries,
                devices: rawPayload.devices
            };
            setCachedData(cacheKey, { success: true, data: payload });
        }

        const topPages = payload.topPages || [];

        return res.json({
            success: true,
            data: {
                siteUrl: payload.siteUrl,
                pages: topPages
            }
        });
    } catch (err) {
        console.error('GSC indexing fetch failed:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/gsc/indexing
// Handles sitemap sync, background scanning trigger, search, status filters, and pagination.
app.get('/api/gsc/indexing', async (req, res) => {
    const siteUrl = req.query.siteUrl ? decodeURIComponent(req.query.siteUrl) : null;
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 25;
    const statusFilter = req.query.status || null; // e.g. INDEXED, NOT_INDEXED, INSPECTION_ERROR
    const searchQuery = req.query.search || null;
    const forceRefresh = req.query.refresh === 'true';

    try {
        const result = await getIndexingData(siteUrl, {
            page,
            pageSize,
            status: statusFilter,
            search: searchQuery,
            refresh: forceRefresh
        });
        return res.json(result);
    } catch (err) {
        console.error('Indexing fetch failed:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/gsc/indexing/inspect
// Direct demand-based manual URL inspection.
app.post('/api/gsc/indexing/inspect', async (req, res) => {
    const siteUrl = req.body.siteUrl;
    const url = req.body.url;

    if (!siteUrl || !url) {
        return res.status(400).json({ success: false, error: 'siteUrl and url are required' });
    }

    try {
        const result = await inspectSingleUrl(siteUrl, url);
        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('Single URL inspection failed:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});
// POST /api/gsc/url-inspection
// Manually inspect a single URL indexing status using cache and map errors cleanly.
app.post('/api/gsc/url-inspection', async (req, res) => {
    const url = req.body.url;
    const forceRefresh = req.query.refresh === 'true';

    // 1. Validate URL presence
    if (!url) {
        return res.status(400).json({ success: false, error: 'Please enter a URL.' });
    }

    // 2. Validate URL structure
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({ success: false, error: 'Please enter a valid URL.' });
    }

    // 3. Resolve site URL (GSC property)
    const siteUrl = req.body.siteUrl || req.query.siteUrl || process.env.GSC_SITE_URL;
    if (!siteUrl) {
        return res.status(400).json({ success: false, error: 'Search Console property is not configured.' });
    }

    // 4. Validate URL belongs to property
    if (!isUrlInProperty(url, siteUrl)) {
        return res.status(400).json({ success: false, error: 'Please enter a URL belonging to the configured Search Console property.' });
    }

    try {
        const result = await inspectSingleUrlWithCache(siteUrl, url, forceRefresh);
        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('URL inspection failed:', err.message);
        const mappedErr = mapUrlInspectionError(err);

        let statusCode = 500;
        if (mappedErr.message.includes('Invalid URL.')) statusCode = 400;
        else if (mappedErr.message.includes('Google authorization has expired')) statusCode = 401;
        else if (mappedErr.message.includes('Access denied')) statusCode = 403;
        else if (mappedErr.message.includes('property was not found')) statusCode = 404;
        else if (mappedErr.message.includes('quota has been exceeded')) statusCode = 429;

        return res.status(statusCode).json({ success: false, error: mappedErr.message });
    }
});

// GET /api/core-web-vitals
// Retrieves Core Web Vitals (LCP, INP, CLS) from Google Chrome UX Report API.
app.get('/api/core-web-vitals', async (req, res) => {
    const url = req.query.url ? decodeURIComponent(req.query.url) : null;
    const device = req.query.device || req.query.formFactor || 'mobile';
    const forceRefresh = req.query.refresh === 'true';

    try {
        const result = await fetchCoreWebVitals(url, device, forceRefresh);
        return res.json(result);
    } catch (err) {
        console.error('Core Web Vitals fetch failed:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/pagespeed/analyze
// Runs Google PageSpeed Insights & Web Vitals analysis
app.post('/api/pagespeed/analyze', async (req, res) => {
    const { url, strategy, refresh } = req.body || {};
    const forceRefresh = refresh === true || req.body?.forceRefresh === true;

    try {
        const result = await analyzePageSpeed(url, strategy, forceRefresh);
        return res.json(result);
    } catch (err) {
        console.error('PageSpeed analysis failed:', err.message);
        const statusCode = err.message.includes('Invalid URL') ? 400 : 500;
        return res.status(statusCode).json({ success: false, error: err.message });
    }
});

// GET /api/pagespeed/analyze
app.get('/api/pagespeed/analyze', async (req, res) => {
    const url = req.query.url ? decodeURIComponent(req.query.url) : null;
    const strategy = req.query.strategy || req.query.device || 'mobile';
    const forceRefresh = req.query.refresh === 'true';

    try {
        const result = await analyzePageSpeed(url, strategy, forceRefresh);
        return res.json(result);
    } catch (err) {
        console.error('PageSpeed analysis GET failed:', err.message);
        const statusCode = err.message.includes('Invalid URL') ? 400 : 500;
        return res.status(statusCode).json({ success: false, error: err.message });
    }
});


function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`\nIntoAEC Dashboard running at http://localhost:${port}`);
        console.log('Open the URL above in your browser.');
        console.log('Click "Refresh Live Data" to pull real social + GA4 + YouTube data.\n');
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < 3010) {
            console.warn(`Port ${port} is busy, trying ${port + 1}...`);
            startServer(port + 1);
            return;
        }

        console.error(
            err.code === 'EADDRINUSE'
                ? `No free port found between ${DEFAULT_PORT} and 3010.`
                : `Server failed to start: ${err.message}`
        );
        process.exitCode = 1;
    });
}

startServer(DEFAULT_PORT);
