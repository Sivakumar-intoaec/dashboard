## Task: Add Country-Wise Google Analytics Report

I already have Google Analytics (GA4) integrated into my existing website/dashboard.

Currently, the dashboard displays:

- **Top 15 Pages by Views**
- Data range: **All-time**
- The existing Google Analytics authentication, OAuth flow, property ID, API integration, and existing page-view report are already working correctly.

### Objective

Add a new Google Analytics report called:

**Top 15 Countries by Views**

The new report should fetch country-wise visitor/page-view data from the same GA4 property that is currently being used by the application.

### Requirements

1. **Reuse the existing Google Analytics integration**
   - Do NOT create a new OAuth flow.
   - Do NOT create a new Google Cloud project.
   - Do NOT create a new GA4 property.
   - Reuse the existing:
     - Google Analytics credentials
     - OAuth access/refresh token
     - GA4 Property ID
     - Google Analytics Data API client/configuration

2. **Create the country-wise report**
   - Use the GA4 Data API.
   - Dimension:
     - `country`
   - Metric:
     - `screenPageViews`
   - Sort countries by views in descending order.
   - Return a maximum of **15 countries**.
   - Use the same **all-time date range** currently used by the Top 15 Pages report.

3. **Expected API request structure**

Use the equivalent of:

```json
{
  "dateRanges": [
    {
      "startDate": "2020-01-01",
      "endDate": "today"
    }
  ],
  "dimensions": [
    {
      "name": "country"
    }
  ],
  "metrics": [
    {
      "name": "screenPageViews"
    }
  ],
  "orderBys": [
    {
      "metric": {
        "metricName": "screenPageViews"
      },
      "desc": true
    }
  ],
  "limit": 15
}
```

Use the application's existing date-range implementation if it already handles the all-time range. Do not hard-code a date if the existing application has a reusable date-range utility.

4. **Backend/API**

Create a separate backend function/API endpoint for the country report only if that matches the existing architecture.

For example:

```text
GET /api/analytics/countries
```

or follow the existing naming convention already used in the project.

The response should be simple and frontend-friendly:

```json
{
  "data": [
    {
      "country": "India",
      "views": 12450
    },
    {
      "country": "United States",
      "views": 8230
    },
    {
      "country": "United Kingdom",
      "views": 3120
    }
  ]
}
```

Follow the existing response/error-handling structure of the project instead of introducing a new response format unnecessarily.

5. **Frontend**

Add a new section/card next to or below the existing:

**Top 15 Pages by Views**

Create:

**Top 15 Countries by Views**

Display:

| Country | Views |
|---|---:|
| India | 12,450 |
| United States | 8,230 |
| United Kingdom | 3,120 |

Use the application's existing UI components, styling, table/card components, typography, spacing, loading states, and error states.

Do NOT introduce a new UI library unless absolutely necessary.

6. **Loading state**

While country data is being fetched, show the same loading/skeleton behavior used by the existing Google Analytics reports.

7. **Error handling**

If the Google Analytics API fails:

- Do not crash the dashboard.
- Display the same error state/pattern used by the existing analytics reports.
- Log useful server-side error information where appropriate.
- Do not expose OAuth credentials, refresh tokens, client secrets, or other sensitive information to the frontend.

8. **Empty data**

If there is no country data, display an appropriate empty state such as:

```text
No country data available
```

Do not display fake/sample data.

9. **Data consistency**

The country report must use the **same GA4 property and authentication context** as the existing Top 15 Pages report.

The result should represent real Google Analytics data.

10. **Do not break the existing report**

The current:

**Top 15 Pages by Views — All-time data**

must continue working exactly as it does now.

Do not modify or remove the existing page-view functionality unless a shared utility needs a safe refactor.

### Code Quality Requirements

Before implementing:

1. Inspect the existing Google Analytics integration.
2. Identify how the current Top 15 Pages report is fetching data.
3. Reuse existing Google Analytics client/authentication utilities.
4. Reuse existing API patterns.
5. Reuse existing frontend components/styles where possible.
6. Follow the project's existing TypeScript/JavaScript conventions.
7. Avoid unnecessary dependencies.
8. Keep Google credentials and tokens server-side.
9. Add proper TypeScript types/interfaces if the project uses TypeScript.

### Final Verification

After implementation, verify:

- Existing Top 15 Pages report still works.
- Country report successfully fetches real GA4 data.
- Countries are sorted by views descending.
- Maximum 15 countries are displayed.
- All-time date range is consistent with the existing report.
- Loading state works.
- Error state works.
- Empty state works.
- No credentials/tokens are exposed to the browser.
- No unnecessary Google OAuth configuration is introduced.

Finally, provide a short summary of:
- Files changed
- New API/backend changes
- Frontend changes
- Google Analytics dimension/metric used
- Any environment variables required
- How to test the implementation locally