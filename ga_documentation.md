# IntoAEC Google Analytics 4 (GA4) Integration Documentation

This document provides a comprehensive technical overview of the **Google Analytics 4 (GA4) Integration Module** within the IntoAEC Analytics Dashboard. It covers the architecture, environment configuration, core API engines, data models, express endpoints, dynamic demographic/dimension filtering, diagnostic utilities, and verification steps.

---

## 1. Architecture & Data Flow

The Google Analytics 4 module integrates directly with the official **Google Analytics Data API (v1beta)** and **Google Analytics Admin API (v1alpha)** via Google's Node.js SDK (`googleapis`). Authentication is handled securely server-side using OAuth 2.0 refresh tokens, keeping secrets completely isolated from the web browser.

```mermaid
graph TD
    Client[Client Browser / Dashboard UI] <-->|HTTP REST Endpoints| Express[Express Server: server.js]
    Express -->|Calls GA4 Methods| Analysis[Analytics Engine: analysis.js]
    Analysis -->|Reads Config & Normalizes IDs| Env[Environment: .env]
    Analysis -->|OAuth2 Refresh Token Auth| OAuth[Google OAuth2 Client]
    OAuth -->|Fetches Access Tokens| GA4API[Google Analytics Data API v1beta]
    
    SubGraph Diagnostics
        Diag[Diagnostic Script: ga4-diagnostic.js] -->|Calls Admin API| AdminAPI[Google Analytics Admin API v1alpha]
    end
```

---

## 2. Configuration & Prerequisites

The GA4 integration requires OAuth 2.0 client credentials and a target GA4 Property ID defined in the workspace [`.env`](file:///d:/sivaTheGreat/dashboard/.env) file.

### Required Environment Variables

| Variable Name | Description | Required Format / Example |
| :--- | :--- | :--- |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth 2.0 Client ID | `123456789-abcdef.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth 2.0 Client Secret | `GOCSPX-xxxxxxxxxxxxxxxxxxxx` |
| `GOOGLE_REFRESH_TOKEN` | Long-lived OAuth 2.0 Refresh Token | `1//0gxxxxxxxxxxxxxxxxxxxxxxxx` |
| `GA_PROPERTY_ID` | Google Analytics 4 Property ID | `123456789` or `properties/123456789` |

### Property ID Normalization
Environment variables can sometimes contain extraneous formatting or prefixes depending on shell execution or `.env` files. The helper function `normalizePropertyId()` automatically cleanses the input:
- Trims whitespace and surrounding single (`'`) or double (`"`) quotes.
- Strips any leading `properties/` prefix, converting `properties/123456789` into `123456789`.

### Required OAuth Scopes
The Google account bound to `GOOGLE_REFRESH_TOKEN` must have granted the following scope:
- `https://www.googleapis.com/auth/analytics.readonly` (Read-only access to GA4 report data)

---

## 3. Core Engine: GA4 Implementation in `analysis.js`

The GA4 logic is implemented in [`analysis.js`](file:///d:/sivaTheGreat/dashboard/analysis.js).

### 3.1. Initialization & OAuth Client Setup
The function `initGoogle()` instantiates the OAuth2 client and binds the Google Analytics Data service:

```javascript
oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });
```

---

### 3.2. Core Reporting Functions

#### 1. Daily Metrics (`getGA4Metrics(startDate, endDate)`)
- **Dimensions:** `['date']`
- **Metrics:** `activeUsers`, `newUsers`, `sessions`, `screenPageViews`, `bounceRate`, `averageSessionDuration`, `conversions`
- **Default Window:** Last 90 days (`90daysAgo` to `today`).

#### 2. Traffic Channel Acquisition (`getGA4TrafficSources(startDate, endDate)`)
- **Dimensions:** `['sessionDefaultChannelGroup']`
- **Metrics:** `sessions`
- **Sorting:** Descending by sessions (Limit: 10 channels).

#### 3. Top Pages Report (`getGA4TopPages(startDate, endDate)`)
- **Dimensions:** `['pagePath']`, `['pageTitle']`
- **Metrics:** `screenPageViews`, `averageSessionDuration`
- **Sorting:** Descending by page views (Limit: 15 pages).
- **Default Window:** All-time / 365 days (`365daysAgo` to `today`).

#### 4. Country Distribution Report (`getGA4TopCountries(startDate, endDate)`)
- **Dimensions:** `['country']`
- **Metrics:** `screenPageViews`
- **Sorting:** Descending by views (Limit: 15 countries).
- **Default Window:** All-time (`2020-01-01` to `today`).
- **Exported Runner:** `runGA4Countries()`

---

### 3.3. Dynamic Dimension & Demographic Filtering Engine

The engine supports dynamic dimension value fetching and complex multi-filter execution for demographic & device analysis.

#### Dimension Mapping (`GA4_DIMENSION_MAP`)
Map of friendly frontend filter keys to GA4 API dimension field names:

| Filter Key | GA4 Dimension Field | Description |
| :--- | :--- | :--- |
| `country` | `country` | User location country |
| `region` | `region` | User location state / region |
| `city` | `city` | User location city |
| `continent` | `continent` | User location continent |
| `sessionSource` | `sessionSource` | Traffic acquisition source |
| `sessionMedium` | `sessionMedium` | Traffic acquisition medium |
| `sessionSourceMedium` | `sessionSourceMedium` | Combined source / medium |
| `sessionCampaignName` | `sessionCampaignName` | Marketing campaign name |
| `sessionDefaultChannelGroup` | `sessionDefaultChannelGroup` | Channel group (Organic, Direct, etc.) |
| `deviceCategory` | `deviceCategory` | Device type (`desktop`, `mobile`, `tablet`) |
| `operatingSystem` | `operatingSystem` | Operating system (`Windows`, `iOS`, etc.) |
| `browser` | `browser` | Web browser (`Chrome`, `Safari`, etc.) |
| `platform` | `platform` | Platform (`web`, `Android`, `iOS`) |

#### Distinct Value Resolver: `getGA4DimensionValues(dimensionKey, startDate, endDate)`
Queries GA4 for top 250 distinct values of a given dimension along with `activeUsers` count to populate frontend filter select boxes. Filters out `(not set)` values.

#### Filter Expression Builder: `buildGA4DimensionFilter(filters)`
Translates key-value filter objects into valid GA4 API `dimensionFilter` objects:
- Single selected value per dimension $\rightarrow$ `stringFilter` with `matchType: 'EXACT'`.
- Multiple selected values per dimension $\rightarrow$ `inListFilter` with an array of values.
- Multiple active dimension filters $\rightarrow$ Wrapped in an `andGroup`.

#### Filtered Analytics Execution: `getFilteredGA4Data(filters, startDate, endDate)`
Runs parallel filtered queries across daily metrics, traffic channels, top pages, and top countries applying the compiled `dimensionFilter`.

---

## 4. Backend API Endpoints in `server.js`

The Express backend in [`server.js`](file:///d:/sivaTheGreat/dashboard/server.js) exposes the following REST API endpoints:

### 4.1. Endpoint Summary

| Method | Path | Description | Query / Body Parameters |
| :--- | :--- | :--- | :--- |
| **`GET`** | `/api/data` | Returns complete dashboard payload (including GA4 metrics, channel split, and top pages) | None |
| **`POST`** | `/api/refresh` | Triggers a fresh analytics fetch and returns updated payload | None |
| **`GET`** | `/api/analytics/countries` | Returns top 15 countries by all-time page views | None |
| **`GET`** | `/api/analytics/dimension-values` | Fetches available distinct values for a given dimension filter | `dimension` (required), `startDate`, `endDate` |
| **`POST`** | `/api/analytics/filter` | Returns filtered metrics, traffic sources, top pages, and country distribution | `{ filters: {...}, startDate, endDate }` |

---

### 4.2. Response Specifications

#### `GET /api/analytics/countries`
```json
{
  "data": [
    {
      "country": "India",
      "views": 15420
    },
    {
      "country": "United States",
      "views": 9840
    }
  ]
}
```

#### `GET /api/analytics/dimension-values?dimension=country`
```json
{
  "success": true,
  "data": [
    {
      "value": "India",
      "count": 12500
    },
    {
      "value": "United States",
      "count": 8100
    }
  ]
}
```

#### `POST /api/analytics/filter`
**Request Payload:**
```json
{
  "filters": {
    "deviceCategory": ["desktop"],
    "country": ["India", "United States"]
  },
  "startDate": "90daysAgo",
  "endDate": "today"
}
```

**Response Payload:**
```json
{
  "success": true,
  "data": {
    "GA4_DAILY": [
      {
        "date": "2026-08-15",
        "users": 150,
        "newUsers": 120,
        "sessions": 180,
        "views": 320,
        "bounceRate": 42.50,
        "dur": 85.4,
        "conversions": 12
      }
    ],
    "GA4_CHANNELS": [
      { "channel": "Organic Search", "sessions": 120 }
    ],
    "GA4_PAGES": [
      { "path": "/reviews", "title": "AEC Software Reviews", "views": 210, "duration": 95.2 }
    ],
    "GA4_COUNTRIES": [
      { "country": "India", "views": 180 }
    ]
  }
}
```

---

## 5. Diagnostic Utility: `ga4-diagnostic.js`

The project includes a standalone diagnostic tool [`ga4-diagnostic.js`](file:///d:/sivaTheGreat/dashboard/ga4-diagnostic.js) for auditing Google Analytics credentials and permissions.

### Capabilities
1. Verifies OAuth2 client configuration and tests access token acquisition.
2. Initializes the Google Analytics Admin API (`google.analyticsadmin('v1alpha')`).
3. Lists all Google Analytics Accounts accessible to the OAuth token.
4. Enumerates all GA4 Properties under each accessible account, printing display names and resource IDs.

### Running the Diagnostic Utility
Execute via Node.js in the terminal:
```powershell
node ga4-diagnostic.js
```

**Sample Output:**
```text
Access token acquired: true

Accounts visible to this token:
- Account: accounts/12345678 | displayName: IntoAEC Account
  Properties:
    - properties/987654321 | displayName: IntoAEC Web Property
```

---

## 6. Security, Resilience & Error Handling

- **Credential Shielding:** Credentials (`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, Access Tokens) are **never exposed** to client responses.
- **Graceful Fallbacks:** If GA4 credentials or Property IDs are missing or unconfigured, the application logs a warning (`⚠️ GA4 skipped`) and continues rendering remaining dashboard platforms (Facebook, Instagram, YouTube) without crashing.
- **Error Interception:** All API calls wrap `runReport` in `try...catch` blocks to prevent unhandled promise rejections and report concise error logs (`❌ GA4 metrics: ...`).

---

## 7. Developer & Verification Guide

### 7.1. Starting the Application
```powershell
npm start
```
Starts the server locally at `http://localhost:3000`.

### 7.2. Verifying Endpoints via HTTP
Using cURL, PowerShell, or browser/Postman:

1. **Verify Main Payload:**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/data"
   ```

2. **Verify Country-Wise Report:**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/analytics/countries"
   ```

3. **Verify Dimension Values (e.g. device categories):**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/analytics/dimension-values?dimension=deviceCategory"
   ```

4. **Test Dynamic Filter API:**
   ```powershell
   $body = @{
       filters = @{ deviceCategory = @("desktop") }
       startDate = "30daysAgo"
       endDate = "today"
   } | ConvertTo-Json

   Invoke-RestMethod -Uri "http://localhost:3000/api/analytics/filter" -Method POST -Body $body -ContentType "application/json"
   ```
