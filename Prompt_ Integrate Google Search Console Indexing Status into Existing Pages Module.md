# Integrate Google Search Console Indexing Status into Existing Pages Module

I already have a working Google Search Console integration in this project.

The existing implementation uses:

- Express backend
- `gsc.js` as the Google Search Console service
- `server.js` as the API layer
- Google OAuth2 refresh-token authentication
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GSC_SITE_URL`
- Google Search Console API
- Existing `/api/gsc` endpoint
- Existing `/api/gsc/sites` endpoint
- Existing 5-minute in-memory caching

The current GSC module already fetches:

- Daily performance
- Top queries
- Top pages
- Device breakdown
- Country breakdown

The existing `fetchTopPages()` uses the `page` dimension and returns page URLs with clicks, impressions, CTR, and average position.

DO NOT create a new Google OAuth implementation or duplicate the existing GSC authentication logic.

The goal is to extend the existing **Pages** module so that each page can also show its **Google indexing status**.

---

# 1. Existing Pages Module

Currently the Pages section displays something similar to:

| Rank | Page | Clicks | Impressions | CTR | Position |
|------|------|--------|-------------|-----|----------|
| 1 | /reviews | 320 | 2100 | 15.24% | 3.4 |
| 2 | /products | 210 | 1800 | 11.66% | 5.2 |

Keep all existing columns and functionality.

Add a new column:

```text
Indexing Status
```

The final table should look like:

| Rank | Page | Clicks | Impressions | CTR | Position | Indexing |
|------|------|--------|-------------|-----|----------|----------|
| 1 | /reviews | 320 | 2100 | 15.24% | 3.4 | ✓ Indexed |
| 2 | /products | 210 | 1800 | 11.66% | 5.2 | ⚠ Not Indexed |
| 3 | /about | 150 | 1200 | 12.50% | 7.1 | ✓ Indexed |

---

# 2. Important Architecture Rule

Reuse the existing GSC authentication implementation.

The existing architecture is:

```text
Frontend
   ↓
GET /api/gsc
   ↓
server.js
   ↓
gsc.js
   ↓
Google OAuth2
   ↓
Google Search Console API
```

The new indexing functionality should follow the same architecture:

```text
Pages UI
   ↓
Backend
   ↓
Existing OAuth2 credentials
   ↓
Google Search Console URL Inspection API
   ↓
Indexing status
   ↓
Pages UI
```

Do NOT expose any of these to the frontend:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
OAuth access token
```

The existing implementation already keeps Google credentials server-side. Preserve this behavior.

---

# 3. Use Google URL Inspection API

For indexing status, use Google's officially supported **URL Inspection API**.

Do not scrape the Google Search Console website.

Do not use undocumented/private Search Console endpoints.

Do not attempt to recreate the entire Search Console "Pages" report.

The requirement is specifically:

> For every page already displayed in the existing Pages section, determine whether Google considers that URL indexed and display the available inspection status.

---

# 4. Create a New GSC Helper

Extend the existing `gsc.js`.

Add a helper similar to:

```javascript
inspectUrl(sc, siteUrl, inspectionUrl)
```

The helper should call Google's URL Inspection API using the existing authenticated Google client.

It should return the relevant information available from the inspection response.

Normalize the response into an application-friendly structure such as:

```javascript
{
    url: "https://intoaec.com/reviews",
    verdict: "PASS",
    indexingState: "INDEXING_ALLOWED",
    coverageState: "Indexed",
    robotsTxtState: "ALLOWED",
    pageFetchState: "SUCCESSFUL",
    lastCrawlTime: "2026-08-17T10:30:00Z",
    googleCanonical: "https://intoaec.com/reviews",
    userCanonical: "https://intoaec.com/reviews"
}
```

If a field is unavailable from Google's response, return `null`.

Do not fabricate values.

---

# 5. Important URL Inspection Requirement

The URLs being inspected must come from the existing `topPages` result.

For example, if `/api/gsc` currently returns:

```javascript
topPages: [
    {
        rank: 1,
        page: "https://intoaec.com/reviews",
        clicks: 320,
        impressions: 2100,
        ctr: 15.24,
        position: 3.4
    },
    {
        rank: 2,
        page: "https://intoaec.com/products",
        clicks: 210,
        impressions: 1800,
        ctr: 11.66,
        position: 5.2
    }
]
```

then inspect:

```text
https://intoaec.com/reviews
https://intoaec.com/products
```

Do not inspect unrelated URLs.

Do not inspect URLs directly from the frontend.

---

# 6. Avoid API Calls on Every Page Load

This is extremely important.

The existing `/api/gsc` endpoint already has a 5-minute cache:

```text
Cache Key:
site:{siteUrl}:{startDate}:{endDate}

TTL:
300000 ms
```

Preserve this existing caching behavior.

For URL Inspection, implement a separate cache because indexing data does not need to be fetched every time the Pages component renders.

Use a cache structure similar to:

```javascript
indexingCache = {
    "https://intoaec.com/reviews": {
        data: {...},
        timestamp: ...
    }
}
```

Suggested indexing cache TTL:

```text
30 minutes
```

or another reasonable value based on the existing project architecture.

The exact TTL should be configurable.

---

# 7. Do Not Inspect All Pages Simultaneously

The current Pages section may contain multiple URLs.

Do NOT execute hundreds of URL Inspection API requests simultaneously.

Use controlled concurrency.

For example:

```text
Maximum concurrent inspections:
5
```

Process URLs in batches:

```text
Batch 1:
URL 1
URL 2
URL 3
URL 4
URL 5

Batch 2:
URL 6
URL 7
URL 8
URL 9
URL 10
```

The exact concurrency value should be configurable.

This is necessary to avoid unnecessary API quota consumption.

---

# 8. Recommended API Design

Do not make the existing `/api/gsc` endpoint unnecessarily slow.

Prefer adding a separate endpoint:

```text
GET /api/gsc/page-indexing
```

Parameters:

```text
siteUrl
startDate
endDate
refresh
```

The endpoint should:

1. Reuse the existing GSC authentication.
2. Call the existing GSC performance functionality to identify the pages if necessary.
3. Inspect the required page URLs.
4. Use cached inspection results whenever possible.
5. Return indexing information alongside page performance data.

Example:

```json
{
    "success": true,
    "data": {
        "siteUrl": "sc-domain:intoaec.com",
        "pages": [
            {
                "rank": 1,
                "page": "https://intoaec.com/reviews",
                "clicks": 320,
                "impressions": 2100,
                "ctr": 15.24,
                "position": 3.4,
                "indexing": {
                    "status": "INDEXED",
                    "verdict": "PASS",
                    "coverageState": "Indexed",
                    "lastCrawlTime": "2026-08-17T10:30:00Z"
                }
            },
            {
                "rank": 2,
                "page": "https://intoaec.com/products",
                "clicks": 210,
                "impressions": 1800,
                "ctr": 11.66,
                "position": 5.2,
                "indexing": {
                    "status": "NOT_INDEXED",
                    "verdict": "FAIL",
                    "coverageState": "Crawled - currently not indexed",
                    "lastCrawlTime": "2026-08-15T08:20:00Z"
                }
            }
        ]
    }
}
```

---

# 9. Better Approach: Do Not Couple Performance and Inspection Too Tightly

If the existing `/api/gsc` endpoint is already being used by multiple dashboard components, avoid changing its response structure in a way that could break the existing frontend.

Instead, preferably create:

```text
GET /api/gsc/page-indexing
```

and keep:

```text
GET /api/gsc
```

unchanged.

This is important because the existing `/api/gsc` response already contains:

```text
clicks
impressions
ctr
position
dailyPerformance
topQueries
topPages
devices
countries
```

Do not break any of these existing properties.

---

# 10. Frontend Integration

Update the existing Pages component.

Do not create an entirely separate Pages dashboard.

Add indexing information directly to the existing page table.

Example:

```text
Pages

Top 15 Pages by Views
All-time data

---------------------------------------------------------------

Page                 Clicks    Impressions   CTR    Position
                                                          Indexing
---------------------------------------------------------------
/reviews              320        2100        15.24%    3.4
                                                          ✓ Indexed

/products             210        1800        11.66%    5.2
                                                          ⚠ Not Indexed

/about                150        1200        12.50%    7.1
                                                          ✓ Indexed
```

Use the existing UI components/styles.

Do not introduce a completely new design system.

---

# 11. Indexing Status UI

Use clear status indicators.

### Indexed

```text
✓ Indexed
```

### Not Indexed

```text
⚠ Not Indexed
```

### Error

```text
✗ Inspection Error
```

### Pending

```text
Checking...
```

### Unknown

```text
Unavailable
```

Do not show "Indexed" unless the Google API response actually supports that conclusion.

---

# 12. Add Indexing Filter

Add a filter to the Pages section:

```text
Indexing Status

[ All ]

[ Indexed ]

[ Not Indexed ]

[ Inspection Error ]
```

Example:

```text
Pages

Indexing:
[ All ▼ ]

Search:
[ Search page URL... ]
```

When the user selects:

```text
Not Indexed
```

show only pages where the inspection status is not indexed.

---

# 13. Add Page Inspection Details

When the user clicks an individual page, show a details panel/modal.

Example:

```text
URL Inspection

https://intoaec.com/reviews

Indexing Status
✓ Indexed

Coverage
Indexed

Robots.txt
Allowed

Page Fetch
Successful

Last Crawl
17 Aug 2026

Google Canonical
https://intoaec.com/reviews

User Canonical
https://intoaec.com/reviews
```

For a non-indexed URL:

```text
URL Inspection

https://intoaec.com/products

Indexing Status
⚠ Not Indexed

Reason
Crawled - currently not indexed

Last Crawl
15 Aug 2026
```

Display only fields actually returned by Google.

---

# 14. Refresh Functionality

Add:

```text
Refresh Indexing
```

The refresh button should call:

```text
GET /api/gsc/page-indexing?refresh=true
```

When `refresh=true`:

- bypass the indexing cache
- request fresh inspection data
- update the cache
- return the latest result

Do not bypass the existing `/api/gsc` cache unless required.

---

# 15. Loading Behavior

Do not block the entire Pages table while indexing information is being retrieved.

The existing page performance data should load normally.

Indexing can initially display:

```text
Checking...
```

Then update each row as indexing information becomes available.

For example:

```text
/reviews       320 clicks    Checking...
/products      210 clicks    Checking...
/about         150 clicks    ✓ Indexed
/contact       120 clicks    ✓ Indexed
```

This will make the dashboard feel faster.

---

# 16. Error Handling

Reuse the existing `handleGSCError(err)` approach where appropriate.

The current application already maps common GSC errors such as:

- 401 / invalid token
- 403 access denied
- 404 property not found
- 429 rate limit exceeded

Preserve this behavior.

For individual URL inspection errors, do not fail the entire Pages response.

For example:

```json
{
    "page": "https://intoaec.com/example",
    "indexing": {
        "status": "INSPECTION_ERROR",
        "message": "Unable to inspect this URL"
    }
}
```

One failed URL must not cause all other pages to fail.

---

# 17. Security

Keep all Google API communication on the backend.

The frontend must never receive:

```text
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
OAuth access token
```

The existing documentation confirms that these credentials are currently isolated server-side. Preserve this security model.

---

# 18. Do Not Modify Existing OAuth

Do NOT add:

```text
new OAuth client
new refresh token
new Google login page
new authentication flow
```

Reuse:

```text
buildOAuthClient()
```

and the existing credentials from `.env`.

The existing GSC module already obtains access tokens using the configured refresh token, so extend that implementation rather than duplicating it.

---

# 19. Do Not Break Existing Pages Data

Before modifying the frontend, inspect how the existing Pages data is consumed.

The existing `topPages` structure contains:

```javascript
{
    rank,
    page,
    clicks,
    impressions,
    ctr,
    position
}
```

Keep all of these fields unchanged.

Only add:

```javascript
indexing
```

Example:

```javascript
{
    rank,
    page,
    clicks,
    impressions,
    ctr,
    position,
    indexing: {
        status,
        verdict,
        coverageState,
        lastCrawlTime,
        indexingState,
        robotsTxtState,
        pageFetchState,
        googleCanonical,
        userCanonical
    }
}
```

---

# 20. Important Google API Limitation

Do not describe this implementation as reproducing the complete Search Console "Pages" indexing report.

This implementation provides **URL-level indexing inspection for the pages displayed in the existing Pages module**.

The distinction is:

```text
Existing Pages module
        ↓
Search Console Search Analytics API
        ↓
Performance data
```

while:

```text
Page Indexing Status
        ↓
URL Inspection API
        ↓
Individual URL inspection result
```

Do not invent aggregate indexing numbers such as:

```text
Total indexed = 198
Total not indexed = 52
```

unless those numbers are actually calculated from inspected URLs.

---

# 21. Files to Inspect Before Coding

Before making any changes, inspect:

```text
gsc.js
server.js
existing Pages frontend component
existing GSC API service
existing GSC data-fetching hooks
existing cache implementation
existing environment configuration
```

Understand the existing implementation first.

Then make the smallest changes necessary.

---

# 22. Testing

Test the following cases:

### Case 1 — Indexed page

Use a known indexed page.

Expected:

```text
✓ Indexed
```

### Case 2 — Non-indexed page

Use a page that Google reports as not indexed.

Expected:

```text
⚠ Not Indexed
```

### Case 3 — Invalid URL

Expected:

```text
Inspection Error
```

without crashing the Pages module.

### Case 4 — Google authentication failure

Expected:

```text
Google authorization has expired or is invalid.
```

### Case 5 — Permission failure

Expected:

```text
Access denied.
Verify that the Google account has permission
to access this Search Console property.
```

### Case 6 — API rate limit

Expected:

```text
Google API rate limit exceeded.
Please try again later.
```

### Case 7 — Cache

Load the Pages module twice within the configured cache period.

The second request should use the cached inspection result instead of making unnecessary Google API requests.

### Case 8 — Refresh

Click:

```text
Refresh Indexing
```

and verify that fresh inspection requests are made.

---

# 23. Final Expected Result

The final Pages module should look conceptually like:

```text
┌─────────────────────────────────────────────────────────────┐
│ Top 15 Pages                                                │
│                                                             │
│ Search: [________________]  Indexing: [All ▼]  [Refresh]   │
├─────────────────────────────────────────────────────────────┤
│ Page          Clicks  Impressions  CTR   Position Indexing │
├─────────────────────────────────────────────────────────────┤
│ /reviews       320      2,100     15.2%    3.4    ✓ Indexed│
│ /products      210      1,800     11.6%    5.2    ⚠ Not    │
│ /about         150      1,200     12.5%    7.1    ✓ Indexed│
│ /contact       120        900     13.3%    8.2    Checking │
└─────────────────────────────────────────────────────────────┘
```

The user should be able to:

1. View existing page performance.
2. See indexing status for each page.
3. Filter pages by indexing status.
4. Search for a specific page.
5. Open detailed URL inspection information.
6. Refresh indexing information.
7. See meaningful errors without breaking the dashboard.

Most importantly, **reuse the existing GSC architecture and OAuth implementation instead of creating a second integration.**