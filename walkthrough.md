# Walkthrough - Single URL Google Search Console Indexing Inspection

I have successfully implemented the **Single URL Google Search Console Indexing Inspection** feature. This allows users to manually input a URL to inspect its status in the dashboard under the "URL Inspection" tab, replacing the sitemap background scanning logic as approved in the implementation plan.

## Changes Made

### Backend

#### 1. [`gsc.js`](file:///d:/sivaTheGreat/dashboard/gsc.js)
- Exported helper functions [`isUrlInProperty`](file:///d:/sivaTheGreat/dashboard/gsc.js#L431) and [`normalizeUrl`](file:///d:/sivaTheGreat/dashboard/gsc.js#L447).
- Added `urlInspectionCache` Map to cache individual inspection results for 30 minutes.
- Added [`inspectSingleUrlWithCache`](file:///d:/sivaTheGreat/dashboard/gsc.js#L875):
  - Bypasses cache when `forceRefresh = true` is passed.
  - Normalizes the response schema exactly as specified.
- Added [`mapUrlInspectionError`](file:///d:/sivaTheGreat/dashboard/gsc.js#L910) to convert raw Google API errors to clean, user-friendly error messages (e.g. invalid permissions, quota limits, auth expiry).

#### 2. [`server.js`](file:///d:/sivaTheGreat/dashboard/server.js)
- Imported the new inspection and validation helpers.
- Added the [`POST /api/gsc/url-inspection`](file:///d:/sivaTheGreat/dashboard/server.js#L246) route:
  - Validates that a URL is provided and conforms to URL structure.
  - Resolves GSC property configuration (`GSC_SITE_URL` from env/body/query) and validates that the requested URL belongs to it.
  - Invokes `inspectSingleUrlWithCache` and maps any exceptions to their corresponding HTTP status codes (400, 401, 403, 404, 429).

### Frontend

#### 3. [`index.html`](file:///d:/sivaTheGreat/dashboard/index.html)
- Renamed the tab nav item from **Indexing** to **URL Inspection** and updated target panel ID.
- Replaced the sitemap page table markup with the new [URL Inspection Form panel](file:///d:/sivaTheGreat/dashboard/index.html#L2340):
  - Form layout with input text field and "Inspect URL" action button.
  - Banner for success/failure status (green/red banner styling matching GSC style).
  - Details card table to list Verdict, Coverage State, Last Crawled, Robots.txt Status, Page Fetch, Google Canonical, and User Canonical.
  - Re-inspect/Refresh button.
- Updated JavaScript logic:
  - Cleaned up obsolete sitemap indexing event handlers, page trackers, and polling logic.
  - Added input validation for empty fields, malformed URLs, and external property URLs.
  - Wired loading states (disabling submit button and input, displaying "Inspecting..." or "Refreshing...").
  - Rendered results in the layout dynamically when a response is received from the server.

---

## Verification Results

Manual verification was performed against a test server instance running on port 3001:

### 1. URL Validation Checks
- **Empty URL check**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3001/api/gsc/url-inspection" -Method Post -Body '{"url":""}' -ContentType "application/json"
  # Response (HTTP 400): {"success":false,"error":"Please enter a URL."}
  ```
- **Malformed URL check**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3001/api/gsc/url-inspection" -Method Post -Body '{"url":"hello"}' -ContentType "application/json"
  # Response (HTTP 400): {"success":false,"error":"Please enter a valid URL."}
  ```
- **External GSC Property URL check**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3001/api/gsc/url-inspection" -Method Post -Body '{"url":"https://google.com"}' -ContentType "application/json"
  # Response (HTTP 400): {"success":false,"error":"Please enter a URL belonging to the configured Search Console property."}
  ```

### 2. Live Inspection Results
- Checking `https://intoaec.ai/about` returns successfully:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3001/api/gsc/url-inspection" -Method Post -Body '{"url":"https://intoaec.ai/about"}' -ContentType "application/json"
  # Response (HTTP 200):
  # {
  #   "success": true,
  #   "data": {
  #     "url": "https://intoaec.ai/about",
  #     "status": "NOT_INDEXED",
  #     "verdict": "NEUTRAL",
  #     "coverageState": "URL is unknown to Google",
  #     "indexingState": null,
  #     ...
  #   }
  # }
  ```

### 3. Caching and Bypass Verification
- A second inspection call hits the cache instantly:
  ```text
  [Cache Hit] Returning cached URL inspection for https://intoaec.ai/about
  ```
- Appending `?refresh=true` successfully bypasses the cache to run a fresh inspection:
  ```text
  [Single Inspection] Inspecting URL: https://intoaec.ai/about
  ```
