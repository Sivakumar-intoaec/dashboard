# Implement Single URL Google Search Console Indexing Inspection

I already have a working Google Search Console integration in my website.

The existing project already has:

- Express backend
- `server.js`
- `gsc.js`
- Google OAuth2 authentication
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GSC_SITE_URL`
- Existing Search Console API integration
- Existing `/api/gsc` endpoint
- Existing `/api/gsc/sites` endpoint
- Existing sitemap-based indexing functionality

I now want to add a **Single URL Indexing Inspection** feature.

## VERY IMPORTANT

Do NOT modify or break:

- Existing Top 15 Landing Pages
- Existing Search Console Performance module
- Existing Countries module
- Existing Queries module
- Existing sitemap-based Indexing module
- Existing OAuth implementation
- Existing `/api/gsc` endpoint

This should be an **additional independent feature**.

---

# 1. Main Requirement

Create a UI where the user can enter **one URL belonging to the configured Search Console property** and check whether Google has indexed that URL.

Example:

```text
URL Inspection

Enter URL

[ https://intoaec.ai/about                         ]

                         [ Inspect URL ]
```

After clicking `Inspect URL`, call the backend.

The backend must use Google's official **Search Console URL Inspection API**.

Do NOT scrape Google Search Console.

Do NOT use undocumented Google endpoints.

---

# 2. User Flow

Implement this flow:

```text
User enters URL
        ↓
Frontend validation
        ↓
POST /api/gsc/url-inspection
        ↓
Backend validates URL
        ↓
Verify URL belongs to GSC property
        ↓
Reuse existing OAuth2 authentication
        ↓
Google URL Inspection API
        ↓
Normalize response
        ↓
Return result to frontend
        ↓
Display indexing status
```

---

# 3. Frontend UI

Add a section/page called:

```text
URL Inspection
```

UI:

```text
┌──────────────────────────────────────────────────────┐
│ URL Inspection                                       │
│                                                      │
│ Check whether a URL is indexed by Google.           │
│                                                      │
│ URL                                                  │
│ [ https://intoaec.ai/about                     ]    │
│                                                      │
│                         [ Inspect URL ]              │
└──────────────────────────────────────────────────────┘
```

Use the existing application's UI components and styling.

Do not introduce a new design system.

---

# 4. URL Input Validation

Before sending the request:

### Empty URL

Show:

```text
Please enter a URL.
```

### Invalid URL

Show:

```text
Please enter a valid URL.
```

### External URL

The URL must belong to the configured Search Console property.

For example, if:

```text
GSC_SITE_URL = sc-domain:intoaec.ai
```

then:

```text
https://intoaec.ai/about
```

is valid.

But:

```text
https://google.com
```

must be rejected.

Show:

```text
Please enter a URL belonging to the configured Search Console property.
```

Do not rely only on frontend validation. Repeat validation on the backend.

---

# 5. Backend Endpoint

Create a new endpoint:

```text
POST /api/gsc/url-inspection
```

Request:

```json
{
    "url": "https://intoaec.ai/about"
}
```

Do not send Google OAuth credentials from the frontend.

---

# 6. Backend Processing

When the backend receives:

```json
{
    "url": "https://intoaec.ai/about"
}
```

perform:

```text
1. Validate URL
2. Normalize URL
3. Validate Search Console property
4. Reuse existing OAuth client
5. Obtain access token
6. Call Google URL Inspection API
7. Normalize response
8. Return result
```

Reuse the existing `buildOAuthClient()` implementation.

Do NOT create another OAuth client.

---

# 7. Google URL Inspection API

Use Google's official URL Inspection API.

Endpoint:

```text
POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
```

Request structure:

```json
{
    "inspectionUrl": "https://intoaec.ai/about",
    "siteUrl": "sc-domain:intoaec.ai",
    "languageCode": "en-US"
}
```

Use the existing authenticated Google OAuth client.

The `inspectionUrl` must belong to the configured Search Console property.

---

# 8. Normalize Google Response

Do not return the entire raw Google response directly to the frontend.

Create a normalized application response.

Return fields when available:

```json
{
    "success": true,
    "data": {
        "url": "https://intoaec.ai/about",
        "status": "INDEXED",
        "verdict": "PASS",
        "coverageState": "Indexed",
        "indexingState": "INDEXING_ALLOWED",
        "robotsTxtState": "ALLOWED",
        "pageFetchState": "SUCCESSFUL",
        "lastCrawlTime": "2026-08-17T10:30:00Z",
        "googleCanonical": "https://intoaec.ai/about",
        "userCanonical": "https://intoaec.ai/about"
    }
}
```

If a field is unavailable:

```text
null
```

Do not fabricate values.

---

# 9. Determine Indexing Status

The frontend should primarily display:

```text
INDEXED
```

or:

```text
NOT_INDEXED
```

or:

```text
INSPECTION_ERROR
```

or:

```text
UNKNOWN
```

Determine the status from the actual Google URL Inspection response.

Do NOT determine "Indexed" merely because:

```text
robotsTxtState = ALLOWED
```

or:

```text
pageFetchState = SUCCESSFUL
```

Those values alone do not prove that the URL is indexed.

---

# 10. Indexed Result UI

If Google reports that the URL is indexed, display:

```text
┌──────────────────────────────────────────────┐
│ ✓ URL is indexed                             │
│                                              │
│ https://intoaec.ai/about                     │
│                                              │
│ Coverage                                     │
│ Indexed                                      │
│                                              │
│ Last Crawl                                   │
│ Aug 17, 2026                                 │
│                                              │
│ Robots.txt                                   │
│ Allowed                                      │
│                                              │
│ Page Fetch                                   │
│ Successful                                   │
│                                              │
│ Google Canonical                             │
│ https://intoaec.ai/about                     │
└──────────────────────────────────────────────┘
```

Use the existing project's success/status styling.

---

# 11. Not Indexed Result UI

If Google reports that the URL is not indexed:

```text
┌──────────────────────────────────────────────┐
│ ✗ URL is not indexed                         │
│                                              │
│ https://intoaec.ai/old-page                  │
│                                              │
│ Reason                                       │
│ Not found (404)                              │
│                                              │
│ Last Crawl                                   │
│ Aug 15, 2026                                 │
│                                              │
│ Page Fetch                                   │
│ Unsuccessful                                 │
└──────────────────────────────────────────────┘
```

Use the actual `coverageState` or other relevant value returned by Google as the reason.

Do not hard-code reasons.

Possible examples include:

```text
Not found (404)
Crawled - currently not indexed
Discovered - currently not indexed
Page with redirect
Excluded by 'noindex' tag
Duplicate, Google chose different canonical
```

Only display a reason if it is actually returned by Google.

---

# 12. Pending / Loading State

When the user clicks:

```text
Inspect URL
```

show:

```text
Inspecting URL...
```

Disable the button while the request is running.

Example:

```text
[ Inspecting... ]
```

Do not allow multiple simultaneous inspection requests from repeated clicks.

---

# 13. Error Handling

Handle errors cleanly.

### 400 — Invalid URL

```text
Invalid URL.
```

### 401 — Authentication

```text
Google authorization has expired or is invalid.
Please renew the Google Search Console authorization.
```

### 403 — Permission

```text
Access denied.
The configured Google account does not have permission
to inspect this Search Console property.
```

### 404 — Property

```text
Search Console property was not found.
```

### 429 — Quota

```text
Google URL Inspection API quota has been exceeded.
Please try again later.
```

### Network / Google API error

```text
Unable to inspect this URL right now.
Please try again later.
```

Do not expose raw Google API credentials or sensitive internal errors to the user.

---

# 14. Backend Response Format

### Success

```json
{
    "success": true,
    "data": {
        "url": "https://intoaec.ai/about",
        "status": "INDEXED",
        "verdict": "PASS",
        "coverageState": "Indexed",
        "indexingState": "INDEXING_ALLOWED",
        "robotsTxtState": "ALLOWED",
        "pageFetchState": "SUCCESSFUL",
        "lastCrawlTime": "2026-08-17T10:30:00Z",
        "googleCanonical": "https://intoaec.ai/about",
        "userCanonical": "https://intoaec.ai/about"
    }
}
```

### Not Indexed

```json
{
    "success": true,
    "data": {
        "url": "https://intoaec.ai/old-page",
        "status": "NOT_INDEXED",
        "verdict": "FAIL",
        "coverageState": "Not found (404)",
        "indexingState": null,
        "robotsTxtState": "ALLOWED",
        "pageFetchState": "NOT_FOUND",
        "lastCrawlTime": "2026-08-15T08:20:00Z",
        "googleCanonical": null,
        "userCanonical": null
    }
}
```

### Error

```json
{
    "success": false,
    "error": "Unable to inspect URL"
}
```

---

# 15. Optional Inspection History / Cache

Do not make unnecessary repeated API calls for the same URL.

Implement a lightweight cache for individual URL inspections.

Suggested cache key:

```text
url-inspection:{siteUrl}:{normalizedUrl}
```

Suggested TTL:

```text
30-60 minutes
```

When the user checks the same URL again within the cache period:

```text
Frontend
   ↓
Backend
   ↓
Cached result exists
   ↓
Return cached result
```

Instead of calling Google again.

However, add a:

```text
Refresh
```

option that forces a fresh Google inspection.

---

# 16. Refresh Inspection

After displaying the result, show:

```text
[ Inspect Again ]
```

or:

```text
[ Refresh ]
```

When clicked:

```text
POST /api/gsc/url-inspection?refresh=true
```

The backend should bypass the cache and perform a fresh Google inspection.

Do not modify or bypass the existing `/api/gsc` performance cache.

---

# 17. Keep This Feature Independent

The new URL Inspection feature must NOT depend on:

```text
Top 15 Landing Pages
```

It must NOT depend on:

```text
Sitemap indexing scan
```

It must be possible to inspect:

```text
https://intoaec.ai/about
```

even if that URL:

- is not in the Top 15 pages
- is not in the sitemap
- has never appeared in Search Analytics

The only important requirement is that it belongs to the Search Console property and can be inspected by the configured Google account.

---

# 18. Do Not Modify Existing Top 15 Pages

The existing implementation has:

```javascript
fetchTopPages(sc, siteUrl, startDate, endDate, limit = 15)
```

Do not modify this function.

Do not add:

```text
URL Inspection API
```

inside it.

Do not change:

```text
limit = 15
```

Do not change the existing `/api/gsc` response.

The new feature should use its own endpoint:

```text
POST /api/gsc/url-inspection
```

---

# 19. Security Requirements

Never send these values to the browser:

```text
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
OAuth access token
```

The browser should send only:

```json
{
    "url": "https://intoaec.ai/about"
}
```

The backend handles everything else.

Reuse the existing Google authentication implementation.

---

# 20. UI Placement

Add the feature as a separate section under Search Console.

For example:

```text
Search Console
│
├── Performance
├── Top 15 Landing Pages
├── Countries
├── Queries
├── Indexing
└── URL Inspection       ← NEW
```

Do not merge this into the existing Top 15 Landing Pages table.

---

# 21. Testing

Test these scenarios:

### Test 1 — Indexed URL

Enter a known indexed URL.

Expected:

```text
✓ URL is indexed
```

### Test 2 — Non-indexed URL

Enter a URL known to be non-indexed.

Expected:

```text
✗ URL is not indexed
Reason: <Google's returned reason>
```

### Test 3 — URL not in sitemap

Enter a valid website URL that is not present in the sitemap.

It should still attempt inspection.

Do NOT reject it just because it is not in the sitemap.

### Test 4 — URL not in Top 15

Enter a valid website URL that does not appear in the Top 15 Landing Pages.

It should still work.

### Test 5 — External URL

Enter:

```text
https://google.com
```

Expected:

```text
Please enter a URL belonging to the configured Search Console property.
```

### Test 6 — Invalid URL

Enter:

```text
hello
```

Expected:

```text
Please enter a valid URL.
```

### Test 7 — Empty URL

Expected:

```text
Please enter a URL.
```

### Test 8 — Refresh

Inspect the same URL twice.

The second request should use the cache.

Click Refresh.

The backend should make a fresh Google API request.

### Test 9 — Authentication failure

Verify that the user receives a friendly authentication error.

### Test 10 — Rate limit

Verify that a Google API quota error is handled gracefully.

---

# 22. Final Expected Experience

The user should be able to open:

```text
Search Console → URL Inspection
```

and see:

```text
┌──────────────────────────────────────────────────┐
│ URL Inspection                                   │
│                                                  │
│ Check whether a specific URL is indexed by      │
│ Google.                                          │
│                                                  │
│ URL                                              │
│ [ https://intoaec.ai/about                 ]    │
│                                                  │
│                         [ Inspect URL ]          │
└──────────────────────────────────────────────────┘
```

After inspection:

```text
┌──────────────────────────────────────────────────┐
│ ✓ URL is indexed                                 │
│                                                  │
│ https://intoaec.ai/about                         │
│                                                  │
│ Coverage: Indexed                                │
│ Last Crawl: Aug 17, 2026                         │
│ Robots.txt: Allowed                              │
│ Page Fetch: Successful                           │
│                                                  │
│ Google Canonical:                                │
│ https://intoaec.ai/about                         │
│                                                  │
│                       [ Inspect Again ]           │
└──────────────────────────────────────────────────┘
```

For a non-indexed URL:

```text
┌──────────────────────────────────────────────────┐
│ ✗ URL is not indexed                             │
│                                                  │
│ https://intoaec.ai/old-page                      │
│                                                  │
│ Reason: Not found (404)                          │
│                                                  │
│ Last Crawl: Aug 15, 2026                         │
│                                                  │
│                       [ Inspect Again ]           │
└──────────────────────────────────────────────────┘
```

## Definition of Done

- [ ] Single URL input is available.
- [ ] URL validation works on frontend and backend.
- [ ] URL must belong to the configured GSC property.
- [ ] Existing OAuth implementation is reused.
- [ ] Google URL Inspection API is used.
- [ ] Indexed status is correctly displayed.
- [ ] Not Indexed status is correctly displayed.
- [ ] Actual Google coverage/reason is displayed when available.
- [ ] Last crawl information is displayed when available.
- [ ] Canonical information is displayed when available.
- [ ] Robots.txt status is displayed when available.
- [ ] Page fetch status is displayed when available.
- [ ] Loading state works.
- [ ] Error handling works.
- [ ] Refresh/re-inspection works.
- [ ] Optional caching prevents unnecessary API calls.
- [ ] Existing Top 15 Landing Pages remains completely unchanged.
- [ ] Existing `/api/gsc` remains unchanged.
- [ ] Existing sitemap-based Indexing module remains unchanged.
- [ ] Google credentials never reach the frontend.