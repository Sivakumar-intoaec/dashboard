# Google Search Console Integration — Implementation Prompt

I want to integrate **Google Search Console** into my existing Next.js website and display Search Console performance data in my website dashboard.

## Current Situation

The project already has:

- Google OAuth configured.
- Google OAuth Client ID and Client Secret configured.
- A valid Google Search Console refresh token already generated and stored securely.
- The Google account associated with the refresh token has access to the required Search Console property.
- Do NOT create a new OAuth authentication flow unless the existing implementation is incomplete.
- Do NOT expose the refresh token, client secret, or access token to the frontend.

## Objective

Integrate the Google Search Console API into the existing application so that:

1. The backend authenticates with Google using the existing OAuth credentials and refresh token.
2. The backend retrieves the Search Console properties available to the authenticated Google account.
3. The user can select the required Search Console property.
4. The backend retrieves Search Analytics data for the selected property.
5. The frontend displays the data in a clean SEO dashboard.

## Step 1 — Review Existing OAuth Implementation

First inspect the existing project and identify:

- Where Google OAuth is configured.
- Where the Client ID is stored.
- Where the Client Secret is stored.
- Where the refresh token is stored.
- How environment variables are currently handled.
- Whether `googleapis` or another Google API library is already installed.
- Existing API routes/services that can be reused.

Do not duplicate existing OAuth functionality.

If the existing implementation already creates a Google OAuth2 client, reuse it.

The OAuth scope required for Search Console read access should be:

`https://www.googleapis.com/auth/webmasters.readonly`

If the existing refresh token was generated with an appropriate Search Console scope, reuse it.

## Step 2 — Environment Variables

Use server-side environment variables similar to:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

If the project already uses different variable names, reuse the existing names instead of creating duplicates.

Never expose these variables through:

- `NEXT_PUBLIC_*`
- frontend JavaScript
- API responses
- browser local storage
- client-side React state

## Step 3 — Create Search Console Service

Create a reusable backend service such as:

```text
lib/google-search-console.ts
```

or follow the existing project's service structure.

The service should:

1. Create/configure the Google OAuth2 client.
2. Set the existing refresh token.
3. Obtain a valid access token automatically.
4. Create the Google Search Console API client.
5. Provide reusable functions for Search Console operations.

For example, create functions conceptually similar to:

```text
getSearchConsoleSites()
getSearchAnalytics()
getTopQueries()
getTopPages()
getDevicePerformance()
getCountryPerformance()
```

Do not expose Google credentials from this service.

## Step 4 — Get Search Console Properties

Before querying analytics, implement:

```text
GET /api/search-console/sites
```

This API should call:

```text
GET https://www.googleapis.com/webmasters/v3/sites
```

The response should return the Search Console properties available to the authenticated Google account.

Example response:

```json
{
  "sites": [
    {
      "siteUrl": "sc-domain:example.com",
      "permissionLevel": "siteOwner"
    }
  ]
}
```

Do not hardcode the Search Console property unless the existing project specifically requires it.

The frontend should be able to retrieve the available properties from this API.

## Step 5 — Search Analytics API

Implement an API endpoint such as:

```text
GET /api/search-console/analytics
```

or follow the existing project's API architecture.

The backend should call:

```text
POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
```

The `siteUrl` must come from the selected Search Console property.

Do not construct the property incorrectly.

For a domain property:

```text
sc-domain:example.com
```

For a URL-prefix property:

```text
https://example.com/
```

Make sure the value is correctly encoded when constructing the API request URL.

## Step 6 — Date Range

The analytics API should support a dynamic date range.

Initially support:

```text
Last 7 days
Last 28 days
Last 3 months
Last 6 months
Custom date range
```

The frontend should allow the user to select the date range.

The backend should send:

```json
{
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "type": "web"
}
```

Do not use future dates.

## Step 7 — Overall Performance

Create an analytics request that retrieves:

- Clicks
- Impressions
- CTR
- Average position

Display these as dashboard KPI cards.

Example:

```text
-----------------------------------------------
| Clicks | Impressions | CTR | Avg Position |
-----------------------------------------------
| 12,450 | 245,800     | 5.06% | 8.4        |
-----------------------------------------------
```

## Step 8 — Performance Over Time

Query Search Console using:

```text
dimensions: ["date"]
```

Display the result as a line chart.

The chart should support:

- Clicks
- Impressions
- CTR
- Average position

Allow the user to switch between metrics.

Example:

```text
Performance
--------------------------------
     📈
     |
     |       /\      /\
     |  /\  /  \____/  \
     |_/  \/            \__
     |
     +-------------------------
       Date
```

## Step 9 — Top Search Queries

Query Search Console using:

```text
dimensions: ["query"]
```

Display a table containing:

| Query | Clicks | Impressions | CTR | Position |
|---|---:|---:|---:|---:|

Add:

- Pagination
- Sorting
- Search/filter
- Number of results
- Date-range filtering

Do not expose unnecessary API metadata.

## Step 10 — Top Pages

Query using:

```text
dimensions: ["page"]
```

Display:

| Page | Clicks | Impressions | CTR | Position |
|---|---:|---:|---:|---:|

Allow users to identify which pages generate the most organic search traffic.

## Step 11 — Country Performance

Query using:

```text
dimensions: ["country"]
```

Display:

| Country | Clicks | Impressions | CTR | Position |
|---|---:|---:|---:|---:|

Use the appropriate country code/name formatting.

## Step 12 — Device Performance

Query using:

```text
dimensions: ["device"]
```

Display:

| Device | Clicks | Impressions | CTR | Position |
|---|---:|---:|---:|---:|

Support:

```text
DESKTOP
MOBILE
TABLET
```

## Step 13 — Dashboard Structure

Create a Search Console dashboard similar to:

```text
Google Search Console
------------------------------------------------

Property:
[ example.com ▼ ]

Date Range:
[ Last 28 Days ▼ ]

------------------------------------------------
| Clicks | Impressions | CTR | Avg Position |
------------------------------------------------

------------------------------------------------
Performance Over Time
[ Clicks | Impressions | CTR | Position ]

              📈 Chart

------------------------------------------------

Top Search Queries
------------------------------------------------
Query                 Clicks  Impressions  CTR
------------------------------------------------
example query         1,250   20,500       6.1%
another query           850   15,200       5.5%

------------------------------------------------

Top Pages
------------------------------------------------
Page                  Clicks  Impressions  CTR
------------------------------------------------

------------------------------------------------

Countries
------------------------------------------------

Devices
------------------------------------------------
```

Use the existing application's UI design system and components rather than introducing a completely different design.

## Step 14 — API Response Structure

Normalize the Google API response before returning it to the frontend.

For example:

```json
{
  "success": true,
  "data": {
    "clicks": 12450,
    "impressions": 245800,
    "ctr": 5.06,
    "position": 8.4,
    "dailyPerformance": [],
    "topQueries": [],
    "topPages": [],
    "countries": [],
    "devices": []
  }
}
```

The frontend should consume this normalized structure instead of depending directly on Google's raw response format.

## Step 15 — Error Handling

Implement proper handling for:

### Invalid refresh token

Return an appropriate authentication error and instruct the user/admin that Google authorization needs to be renewed.

### Search Console permission error

Handle cases where the authenticated Google account does not have access to the requested property.

### Invalid property

Return a clear error if the selected property does not exist.

### API rate limits

Handle Google API rate-limit responses gracefully.

### No data

If Search Console has no data for the selected period, display:

```text
No Search Console data is available for this date range.
```

Do not treat this as a server error.

### Google API failure

Return a safe application-level error.

Never return:

- Client Secret
- Refresh Token
- Access Token
- Internal Google authentication details

## Step 16 — Security Requirements

This is extremely important.

Never expose:

```text
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
Google access token
```

to the browser.

The architecture must be:

```text
Browser
   ↓
Next.js API
   ↓
Google OAuth Client
   ↓
Search Console API
```

NOT:

```text
Browser
   ↓
Google Search Console API
```

The refresh token must remain server-side.

## Step 17 — Performance

Avoid making unnecessary Search Console API requests.

Implement:

- Server-side caching where appropriate.
- Request deduplication if supported by the existing architecture.
- Reasonable API pagination.
- Loading states.
- Error states.
- Empty states.

Do not make separate API calls repeatedly every time a component renders.

## Step 18 — Frontend Loading States

While retrieving Search Console data, show appropriate loading UI:

```text
Loading Search Console data...
```

Use the existing application's loading/skeleton components if available.

## Step 19 — Final Implementation Requirements

Before modifying the project:

1. Inspect the existing architecture.
2. Identify the existing OAuth implementation.
3. Identify the existing API/service structure.
4. Reuse existing utilities and components.
5. Do not duplicate authentication logic.
6. Do not expose credentials.
7. Follow the existing TypeScript/JavaScript conventions.
8. Follow the existing error-handling pattern.
9. Follow the existing UI/component conventions.

After implementation, verify:

```text
[ ] OAuth refresh token works
[ ] Search Console properties can be retrieved
[ ] Correct siteUrl is selected
[ ] Search Analytics API works
[ ] Date filtering works
[ ] Clicks are displayed
[ ] Impressions are displayed
[ ] CTR is displayed
[ ] Average position is displayed
[ ] Daily performance chart works
[ ] Top queries work
[ ] Top pages work
[ ] Country data works
[ ] Device data works
[ ] Loading states work
[ ] Empty states work
[ ] Error handling works
[ ] Refresh token is never exposed
[ ] Client secret is never exposed
```

## Important Constraint

**Do not generate a new Google OAuth login flow because OAuth has already been configured.**

Reuse the existing refresh token and OAuth configuration, and focus on implementing the **Search Console API integration, backend endpoints, data transformation, and frontend dashboard**.