# IntoAEC Google Search Console Module Documentation

This document describes the design, API endpoints, module configuration, data models, error handling, and caching details of the **Google Search Console (GSC) Integration Module** in the IntoAEC Analytics Dashboard project.

---

## 1. Architecture & Data Flow

The Search Console module utilizes Google's official APIs to query search analytics. It handles request normalization and credentials securely server-side, protecting the OAuth 2.0 secrets from browser exposure.

```mermaid
graph TD
    A[Client Browser] <-->|HTTP GET /api/gsc| B[Express Server: server.js]
    B -->|Calls runGSC()| C[GSC Module: gsc.js]
    C -->|Reads Config| D[Environment: .env]
    C -->|OAuth2 Refresh Token Auth| E[Google OAuth Client]
    C -->|Parallel API Queries| F[Google Search Console API v1]
```

The server caches the retrieved data in an in-memory cache to prevent hitting Google API rate limits.

---

## 2. Configuration & Prerequisites

The GSC module relies on OAuth 2.0 credentials and configuration values defined in the [`.env`](file:///d:/sivaTheGreat/dashboard/.env) file.

### Required Environment Variables

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| `GOOGLE_CLIENT_ID` | Google OAuth2 Client ID from the Google Developer Console | `123456-abcdef.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET`| Google OAuth2 Client Secret | `GOCSPX-xxxxxx` |
| `GOOGLE_REFRESH_TOKEN`| Long-lived OAuth2 Refresh Token with webmasters scope | `1//0gxxx-xxxxxx` |
| `GSC_SITE_URL` | The verified Search Console site property (default fallback) | `sc-domain:intoaec.com` or `https://intoaec.com/` |

### Required Scope
To fetch Search Console data, the Google Account associated with the `GOOGLE_REFRESH_TOKEN` must have approved the following scope:
- `https://www.googleapis.com/auth/webmasters.readonly` (Read-only access to Search Console data)

> [!IMPORTANT]
> **Credential Normalization:**
> To prevent environment-specific format issues (e.g. windows/shell wrapping quotes), the module automatically strips leading/trailing single (`'`) or double (`"`) quotes and trims surrounding spaces from environment values using the `normalizeEnvValue()` helper.

---

## 3. Core Engine: `gsc.js`

The core GSC engine is defined in [`gsc.js`](file:///d:/sivaTheGreat/dashboard/gsc.js). It performs authentication and issues queries to the Google Search Console API.

### Authentication Flow
The function `buildOAuthClient()` instantiates a `google.auth.OAuth2` client:
1. Validates that `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` are configured.
2. Injects the refresh token into the OAuth2 client.
3. Automatically obtains a valid Access Token on demand using `auth.getAccessToken()`.

### API Queries and Fetching Sub-methods
The module runs five queries concurrently using `Promise.all()` to gather comprehensive performance data:

1. **`fetchDailyPerformance(sc, siteUrl, startDate, endDate)`**
   - **Dimension:** `['date']`
   - **Output:** Array of daily metrics sorted ascending by date.
   - **Metrics:** Clicks, Impressions, CTR (formatted as percentage `* 100` and rounded to 2 decimal places), and Average Position (rounded to 1 decimal place).

2. **`fetchTopQueries(sc, siteUrl, startDate, endDate, limit = 100)`**
   - **Dimension:** `['query']`
   - **Output:** Top search terms that drove organic traffic, sorted descending by clicks.
   - **Metrics:** Clicks, Impressions, CTR, and Average Position.

3. **`fetchTopPages(sc, siteUrl, startDate, endDate, limit = 15)`**
   - **Dimension:** `['page']`
   - **Output:** Landing page URLs driving traffic, sorted descending by clicks.
   - **Metrics:** Clicks, Impressions, CTR, and Average Position.

4. **`fetchDeviceBreakdown(sc, siteUrl, startDate, endDate)`**
   - **Dimension:** `['device']`
   - **Output:** Traffic splits by device category (`DESKTOP`, `MOBILE`, `TABLET`).
   - **Metrics:** Clicks, Impressions, CTR, and Average Position.

5. **`fetchCountryBreakdown(sc, siteUrl, startDate, endDate)`**
   - **Dimension:** `['country']`
   - **Output:** Top 10 countries sorted descending by clicks.
   - **Metrics:** Country Code (uppercase, three-letter format), Clicks, Impressions, CTR, and Average Position.

### Exports
- **`runGSC(customSiteUrl, startDate, endDate)`**: Core runner. Performs authentication, executes sub-fetches in parallel, compiles summary metrics (total clicks, total impressions, average CTR, average position), and returns a unified data payload.
- **`listSites()`**: Diagnostic method. Queries `sc.sites.list()` to return a list of verified domains/URLs accessible to the credentials, alongside permission levels.

---

## 4. API Layer: Express Server Integration

The Express backend in [`server.js`](file:///d:/sivaTheGreat/dashboard/server.js) maps the GSC service to HTTP endpoints and handles caching.

### 4.1. Server Caching Strategy
To prevent hitting Google's rate limits and optimize page load speed, the server uses an in-memory caching mechanism:
- **Cache Key:** `site:{siteUrl}:{startDate}:{endDate}`
- **TTL (Time to Live):** 5 minutes (`300,000` ms).
- **Cache Bypass:** Passing the query parameter `refresh=true` bypasses the cache and forces a fresh query to the Google APIs.

### 4.2. API Endpoints

#### `GET /api/gsc`
Fetches Search Console analytics.
- **Query Parameters:**
  - `siteUrl` (optional, URL-encoded): Override the default GSC property.
  - `startDate` (optional, `YYYY-MM-DD`): Start date. Defaults to 90 days ago.
  - `endDate` (optional, `YYYY-MM-DD`): End date. Defaults to today.
  - `refresh` (optional, `true`/`false`): Set to `true` to force bypass the cache.

- **Example Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "siteUrl": "sc-domain:intoaec.com",
    "dateRange": {
      "startDate": "2026-05-20",
      "endDate": "2026-08-18"
    },
    "clicks": 1420,
    "impressions": 35200,
    "ctr": 4.03,
    "position": 12.4,
    "dailyPerformance": [
      {
        "date": "2026-08-15",
        "clicks": 45,
        "impressions": 1100,
        "ctr": 4.09,
        "position": 11.8
      }
    ],
    "topQueries": [
      {
        "rank": 1,
        "query": "aec software reviews",
        "clicks": 120,
        "impressions": 850,
        "ctr": 14.12,
        "position": 2.1
      }
    ],
    "topPages": [
      {
        "rank": 1,
        "page": "https://intoaec.com/reviews",
        "clicks": 320,
        "impressions": 2100,
        "ctr": 15.24,
        "position": 3.4
      }
    ],
    "devices": [
      {
        "device": "DESKTOP",
        "clicks": 980,
        "impressions": 22000,
        "ctr": 4.45,
        "position": 11.2
      }
    ],
    "countries": [
      {
        "country": "USA",
        "clicks": 710,
        "impressions": 15000,
        "ctr": 4.73,
        "position": 10.9
      }
    ]
  }
}
```

#### `GET /api/gsc/sites`
Diagnostic endpoint to retrieve list of accessible GSC property sites.
- **Example Response (`200 OK`):**
```json
{
  "sites": [
    {
      "siteUrl": "sc-domain:intoaec.com",
      "permissionLevel": "siteOwner"
    },
    {
      "siteUrl": "https://intoaec.com/",
      "permissionLevel": "siteFullUser"
    }
  ]
}
```

---

## 5. Security & Robust Error Handling

### Security Shield
Google credentials (`GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN`) and generated OAuth access tokens are **strictly isolated server-side**. They are never included in the JSON responses returned by `/api/gsc` or `/api/gsc/sites`.

### API Error Mapping
The helper function `handleGSCError(err)` translates low-level Google API errors into user-friendly and actionable application-level messages:

| HTTP Status / Keyword | Mapped User Message | Action Suggested |
| :--- | :--- | :--- |
| `401` / `invalid_grant` / `token` | *Google authorization has expired or is invalid. Please renew Google authorization in .env.* | Re-run authorization script to obtain a new refresh token. |
| `403` | *Access denied. Verify that your Google account has permission to access the requested site in Google Search Console.* | Grant owner or user access in GSC settings for the property. |
| `404` | *Search Console property not found. Verify the site URL is verified in your account.* | Check spelling or verify ownership in Google Search Console portal. |
| `429` | *Google API rate limit exceeded. Please try again later.* | Wait for rate limits to reset. |
| Others | *Google API error: [Details]* | Review console logs. |

---

## 6. Development & Verification Guide

### 6.1. Running Locally
Start the Express server locally:
```powershell
npm start
```
This boots the server on port `3000` (or another port if busy).

### 6.2. Quick API Diagnostics
You can verify the integration by sending HTTP requests to the local server:

1. **Verify property accessibility:**
   Query this URL in a browser or API tool (e.g., Postman):
   ```text
   http://localhost:3000/api/gsc/sites
   ```

2. **Verify live analytics fetching:**
   Query the default site analytics payload:
   ```text
   http://localhost:3000/api/gsc
   ```
   Or query a specific URL-encoded property with custom dates:
   ```text
   http://localhost:3000/api/gsc?siteUrl=sc-domain%3Aintoaec.com&startDate=2026-06-01&endDate=2026-08-01
   ```
