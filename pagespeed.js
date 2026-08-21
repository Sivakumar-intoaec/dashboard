import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

function normalizeEnvValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, normalizeEnvValue(value)])
);

const PAGESPEED_API_KEY = rawEnv.PAGESPEED_API_KEY || rawEnv.CRUX_API_KEY || rawEnv.YOUTUBE_API_KEY || '';

// Server-side Cache for PageSpeed analysis results (1 Hour TTL)
const pagespeedCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Format metric value helper
 */
function formatLcpValue(valInMs) {
  if (valInMs == null) return '—';
  const sec = (valInMs / 1000).toFixed(1);
  return `${sec} s`;
}

function formatInpValue(valInMs) {
  if (valInMs == null) return '—';
  return `${Math.round(valInMs)} ms`;
}

function formatClsValue(val) {
  if (val == null) return '—';
  const num = val > 10 ? val / 100 : val;
  return num.toFixed(2);
}

/**
 * Metric status classifiers according to Google standards
 */
function getLcpStatus(ms) {
  if (ms == null) return { status: 'unknown', label: 'No Data' };
  if (ms <= 2500) return { status: 'good', label: 'Good' };
  if (ms <= 4000) return { status: 'needs-improvement', label: 'Needs Improvement' };
  return { status: 'poor', label: 'Poor' };
}

function getInpStatus(ms) {
  if (ms == null) return { status: 'unknown', label: 'No Data' };
  if (ms <= 200) return { status: 'good', label: 'Good' };
  if (ms <= 500) return { status: 'needs-improvement', label: 'Needs Improvement' };
  return { status: 'poor', label: 'Poor' };
}

function getClsStatus(val) {
  if (val == null) return { status: 'unknown', label: 'No Data' };
  const score = val > 10 ? val / 100 : val;
  if (score <= 0.1) return { status: 'good', label: 'Good' };
  if (score <= 0.25) return { status: 'needs-improvement', label: 'Needs Improvement' };
  return { status: 'poor', label: 'Poor' };
}

function getCategoryStatus(score) {
  if (score == null) return 'unknown';
  if (score >= 90) return 'good';
  if (score >= 50) return 'needs-improvement';
  return 'poor';
}

/**
 * Parse CrUX metric distributions into percentage numbers
 */
function parseDistribution(metricObj) {
  if (!metricObj || !Array.isArray(metricObj.distributions)) {
    return { goodPct: 0, needsImpPct: 0, poorPct: 0 };
  }
  const dists = metricObj.distributions;
  const good = dists[0]?.proportion ? Math.round(dists[0].proportion * 100) : 0;
  const needsImp = dists[1]?.proportion ? Math.round(dists[1].proportion * 100) : 0;
  const poor = dists[2]?.proportion ? Math.round(dists[2].proportion * 100) : 0;
  return { goodPct: good, needsImpPct: needsImp, poorPct: poor };
}

/**
 * Core function to run PageSpeed Insights analysis
 */
export async function analyzePageSpeed(targetUrl, strategy = 'mobile', forceRefresh = false) {
  // 1. Sanitize input URL
  let cleanUrl = (targetUrl || 'https://intoaec.ai/').trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  try {
    const parsed = new URL(cleanUrl);
    cleanUrl = parsed.href;
  } catch (e) {
    throw new Error('Invalid URL format provided. Please enter a valid HTTP/HTTPS web address.');
  }

  const stratKey = (strategy || 'mobile').toLowerCase() === 'desktop' ? 'desktop' : 'mobile';
  const cacheKey = `ps:${cleanUrl}:${stratKey}`;
  const now = Date.now();

  // 2. Check Cache
  if (!forceRefresh) {
    const cached = pagespeedCache.get(cacheKey);
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[Cache Hit] Returning cached PageSpeed analysis for ${cacheKey}`);
      return { ...cached.data, cached: true, timestamp: cached.timestamp };
    }
  }

  // 3. Construct Request to Google PageSpeed API v5
  const endpoint = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
  const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
  const explicitKey = rawEnv.PAGESPEED_API_KEY || '';
  const fallbackKey = rawEnv.CRUX_API_KEY || rawEnv.YOUTUBE_API_KEY || '';
  const apiKey = explicitKey || fallbackKey;

  const buildUrl = (keyToUse) => {
    const params = new URLSearchParams();
    params.append('url', cleanUrl);
    params.append('strategy', stratKey);
    categories.forEach(cat => params.append('category', cat));
    if (keyToUse) {
      params.append('key', keyToUse);
    }
    return `${endpoint}?${params.toString()}`;
  };

  let responseData = null;
  try {
    const res = await axios.get(buildUrl(apiKey), { timeout: 120000 });
    responseData = res.data;
  } catch (err) {
    const apiError = err.response?.data?.error;
    if (err.response?.status === 403 && apiKey && apiError?.message?.includes('PageSpeed Insights API has not been used')) {
      console.warn('API key rejected PageSpeed API, attempting unauthenticated request...');
      try {
        const retryRes = await axios.get(buildUrl(''), { timeout: 120000 });
        responseData = retryRes.data;
      } catch (retryErr) {
        console.error('PageSpeed unauthenticated retry error:', retryErr.response?.data || retryErr.message);
        throw new Error('Google PageSpeed Insights API is not enabled on your Google Cloud API Key. Enable "PageSpeed Insights API" in Google Cloud Console (https://console.developers.google.com/apis/api/pagespeedonline.googleapis.com/overview) and set PAGESPEED_API_KEY in .env.');
      }
    } else {
      console.error('PageSpeed Insights API request error:', err.response?.data || err.message);
      if (apiError) {
        if (apiError.code === 400) {
          throw new Error(`PageSpeed analysis failed: ${apiError.message || 'Invalid request parameters or target URL cannot be analyzed.'}`);
        }
        if (apiError.code === 429) {
          throw new Error('Google PageSpeed API rate limit / daily quota exceeded. Enable "PageSpeed Insights API" on your Google Cloud Key to get 25,000 free requests per day.');
        }
        if (apiError.code === 403) {
          throw new Error('Google PageSpeed Insights API is not enabled on your Google Cloud API Key. Enable "PageSpeed Insights API" in Google Cloud Console (https://console.developers.google.com/apis/api/pagespeedonline.googleapis.com/overview) and set PAGESPEED_API_KEY in .env.');
        }
        throw new Error(`Google PageSpeed API Error (${apiError.code}): ${apiError.message}`);
      }
      throw new Error(`Failed to contact Google PageSpeed Insights service: ${err.message}`);
    }
  }

  // 5. Extract & Normalize Response Data
  const lighthouse = responseData.lighthouseResult || {};
  const loadingExp = responseData.loadingExperience || {};
  const originExp = responseData.originLoadingExperience || {};

  // Category Scores (0 - 100)
  const perfScore = lighthouse.categories?.performance?.score != null ? Math.round(lighthouse.categories.performance.score * 100) : null;
  const accessScore = lighthouse.categories?.accessibility?.score != null ? Math.round(lighthouse.categories.accessibility.score * 100) : null;
  const bpScore = lighthouse.categories?.['best-practices']?.score != null ? Math.round(lighthouse.categories['best-practices'].score * 100) : null;
  const seoScore = lighthouse.categories?.seo?.score != null ? Math.round(lighthouse.categories.seo.score * 100) : null;

  const scores = {
    performance: perfScore,
    performanceStatus: getCategoryStatus(perfScore),
    accessibility: accessScore,
    bestPractices: bpScore,
    seo: seoScore
  };

  // Lighthouse Audits (Lab Data)
  const audits = lighthouse.audits || {};

  const labLcpMs = audits['largest-contentful-paint']?.numericValue || null;
  const labClsScore = audits['cumulative-layout-shift']?.numericValue != null ? audits['cumulative-layout-shift'].numericValue : null;
  const labTbtMs = audits['total-blocking-time']?.numericValue || null;
  const labFcpMs = audits['first-contentful-paint']?.numericValue || null;
  const labTtfbMs = audits['server-response-time']?.numericValue || null;
  const labSpeedIndexMs = audits['speed-index']?.numericValue || null;

  const labData = {
    lcp: {
      value: labLcpMs != null ? +(labLcpMs / 1000).toFixed(2) : null,
      displayValue: audits['largest-contentful-paint']?.displayValue || formatLcpValue(labLcpMs),
      unit: 's',
      ...getLcpStatus(labLcpMs)
    },
    cls: {
      value: labClsScore != null ? +labClsScore.toFixed(3) : null,
      displayValue: audits['cumulative-layout-shift']?.displayValue || formatClsValue(labClsScore),
      unit: '',
      ...getClsStatus(labClsScore)
    },
    fcp: {
      value: labFcpMs != null ? +(labFcpMs / 1000).toFixed(2) : null,
      displayValue: audits['first-contentful-paint']?.displayValue || (labFcpMs ? `${(labFcpMs / 1000).toFixed(1)} s` : '—'),
      unit: 's'
    },
    ttfb: {
      value: labTtfbMs != null ? Math.round(labTtfbMs) : null,
      displayValue: audits['server-response-time']?.displayValue || (labTtfbMs ? `${Math.round(labTtfbMs)} ms` : '—'),
      unit: 'ms'
    },
    speedIndex: {
      value: labSpeedIndexMs != null ? +(labSpeedIndexMs / 1000).toFixed(2) : null,
      displayValue: audits['speed-index']?.displayValue || (labSpeedIndexMs ? `${(labSpeedIndexMs / 1000).toFixed(1)} s` : '—'),
      unit: 's'
    },
    tbt: {
      value: labTbtMs != null ? Math.round(labTbtMs) : null,
      displayValue: audits['total-blocking-time']?.displayValue || (labTbtMs ? `${Math.round(labTbtMs)} ms` : '—'),
      unit: 'ms'
    }
  };

  // Field Data (Real-User / CrUX Data)
  const activeExp = (loadingExp.metrics && Object.keys(loadingExp.metrics).length > 0) ? loadingExp : (originExp.metrics ? originExp : null);
  let fieldData = {
    available: false,
    isOriginFallback: activeExp === originExp && activeExp !== loadingExp,
    overallCategory: 'UNKNOWN',
    message: 'Real-user data is not available for this URL.',
    metrics: null
  };

  if (activeExp && activeExp.metrics) {
    const m = activeExp.metrics;
    fieldData.available = true;
    fieldData.overallCategory = activeExp.overall_category || 'AVERAGE';
    fieldData.message = fieldData.isOriginFallback
      ? 'Field data shown is origin fallback aggregated across all pages on this domain.'
      : 'Real-user experience data from Chrome UX Report.';

    const fLcp = m['LARGEST_CONTENTFUL_PAINT_MS'];
    const fInp = m['INTERACTION_TO_NEXT_PAINT'];
    const fCls = m['CUMULATIVE_LAYOUT_SHIFT_SCORE'];
    const fFcp = m['FIRST_CONTENTFUL_PAINT_MS'];
    const fTtfb = m['EXPERIMENTAL_TIME_TO_FIRST_BYTE'];

    const lcpMs = fLcp?.percentile != null ? fLcp.percentile : null;
    const inpMs = fInp?.percentile != null ? fInp.percentile : null;
    const clsRaw = fCls?.percentile != null ? fCls.percentile : null;
    const clsScore = clsRaw != null ? (clsRaw > 10 ? clsRaw / 100 : clsRaw) : null;
    const fcpMs = fFcp?.percentile != null ? fFcp.percentile : null;
    const ttfbMs = fTtfb?.percentile != null ? fTtfb.percentile : null;

    fieldData.metrics = {
      lcp: {
        value: lcpMs != null ? +(lcpMs / 1000).toFixed(2) : null,
        displayValue: formatLcpValue(lcpMs),
        unit: 's',
        ...getLcpStatus(lcpMs),
        distributions: parseDistribution(fLcp)
      },
      inp: {
        value: inpMs != null ? Math.round(inpMs) : null,
        displayValue: formatInpValue(inpMs),
        unit: 'ms',
        ...getInpStatus(inpMs),
        distributions: parseDistribution(fInp)
      },
      cls: {
        value: clsScore != null ? +clsScore.toFixed(2) : null,
        displayValue: formatClsValue(clsScore),
        unit: '',
        ...getClsStatus(clsScore),
        distributions: parseDistribution(fCls)
      },
      fcp: {
        value: fcpMs != null ? +(fcpMs / 1000).toFixed(2) : null,
        displayValue: fcpMs ? `${(fcpMs / 1000).toFixed(1)} s` : '—',
        unit: 's'
      },
      ttfb: {
        value: ttfbMs != null ? Math.round(ttfbMs) : null,
        displayValue: ttfbMs ? `${Math.round(ttfbMs)} ms` : '—',
        unit: 'ms'
      }
    };
  }

  // Unified Core Web Vitals (Prefers Field Data, falls back to Lab Data)
  const coreWebVitals = {
    lcp: fieldData.available && fieldData.metrics?.lcp?.value != null
      ? fieldData.metrics.lcp
      : labData.lcp,
    inp: fieldData.available && fieldData.metrics?.inp?.value != null
      ? fieldData.metrics.inp
      : {
        value: labData.tbt.value,
        displayValue: labData.tbt.displayValue,
        unit: 'ms (TBT lab proxy)',
        ...getInpStatus(labData.tbt.value)
      },
    cls: fieldData.available && fieldData.metrics?.cls?.value != null
      ? fieldData.metrics.cls
      : labData.cls
  };

  const normalizedResult = {
    success: true,
    url: cleanUrl,
    strategy: stratKey,
    scores,
    coreWebVitals,
    fieldData,
    labData,
    metrics: {
      fcp: labData.fcp.displayValue,
      ttfb: labData.ttfb.displayValue,
      speedIndex: labData.speedIndex.displayValue,
      tbt: labData.tbt.displayValue
    },
    fetchedAt: new Date().toISOString()
  };

  // Save to Cache
  pagespeedCache.set(cacheKey, { timestamp: now, data: normalizedResult });

  return { ...normalizedResult, cached: false, timestamp: now };
}
