## Task: Implement Google Analytics Demographic Filters

I already have a **Google Analytics (GA4) module** implemented in my website.

The existing module is already connected to Google Analytics and currently displays analytics reports such as **Top 15 Pages by Views** and other GA4 data.

I now want to add a **Demographics / Audience Filters** section similar to the demographic filters available in Google Analytics.

### Required Filters

Add the following seven filters:

1. Country
2. Region
3. Town/City
4. Language
5. Age
6. Gender
7. Interests

The UI should closely follow the existing design of my Google Analytics module.

---

## 1. Reuse Existing Google Analytics Integration

Do NOT create a new Google OAuth implementation.

Reuse the existing:

- Google OAuth authentication
- Access token / refresh token mechanism
- GA4 Property ID
- Google Analytics Data API client
- Existing backend Google Analytics service
- Existing API routes
- Existing error handling
- Existing environment variables

Before making changes, inspect the existing Google Analytics implementation and understand how the current reports are fetched.

Do not duplicate authentication or Google Analytics client initialization.

---

## 2. Demographic Filter UI

Add a filter section similar to:

```text
Demographic Filters

Country       [ All Countries ▼ ]
Region        [ All Regions ▼ ]
Town/City     [ All Cities ▼ ]
Language      [ All Languages ▼ ]
Age           [ All Ages ▼ ]
Gender        [ All Genders ▼ ]
Interests     [ All Interests ▼ ]

                    [Apply Filters]
```

Use the existing UI components, dropdown/select components, styling, spacing, typography, and responsive behavior already used by the Google Analytics module.

Do not introduce a new UI library unnecessarily.

---

## 3. GA4 Dimensions

Use the appropriate GA4 Data API dimensions.

The expected mappings are:

| UI Filter | GA4 Dimension |
|---|---|
| Country | `country` |
| Region | `region` |
| Town/City | `city` |
| Language | `language` |
| Age | `userAgeBracket` |
| Gender | `userGender` |

Verify the actual availability of each dimension against the GA4 property's metadata before making the API request.

Do not blindly assume that every dimension is available for every GA4 property.

---

## 4. Interests

Handle **Interests** separately.

Do NOT assume that there is a generic GA4 Data API dimension named `interests`.

Before implementing the Interests filter:

1. Check the GA4 property's metadata.
2. Determine whether an appropriate interest-related dimension/report is available.
3. If it is available, use the officially supported dimension.
4. If it is not available through the existing GA4 Data API integration, do NOT fabricate an API field.
5. Clearly handle the unsupported case in the UI/backend.

The implementation must use an officially supported Google Analytics API capability rather than inventing a dimension.

---

## 5. Filter Values

The dropdown values should come from **real Google Analytics data**.

Do NOT hard-code values such as:

```text
India
USA
UK
Male
Female
18-24
25-34
```

Instead, fetch the available values dynamically from GA4.

For example:

```text
Country
----------------
All Countries
India
United States
United Kingdom
Canada
Germany
...
```

Similarly:

```text
Age
----------------
All Ages
18-24
25-34
35-44
45-54
55-64
65+
```

Only display values that are actually returned by the GA4 property.

---

## 6. Cascading Filters

Implement the filters intelligently.

For example:

```text
Country = India
       ↓
Region dropdown
       ↓
Only regions belonging to India
```

Then:

```text
Country = India
Region = Tamil Nadu
       ↓
Town/City
       ↓
Only cities belonging to Tamil Nadu
```

Similarly, when a parent filter changes:

- Clear incompatible child selections.
- Reload the dependent dropdown.
- Do not show stale values.

Example:

```text
Country
   ↓
Region
   ↓
Town/City
```

---

## 7. Applying Filters to Analytics Reports

The selected demographic filters should be usable to filter the existing Google Analytics reports.

For example:

```text
Country = India
Age = 25-34
Gender = Male
```

Then the analytics report should return data matching:

```text
Country = India
AND
Age = 25-34
AND
Gender = Male
```

Use GA4 Data API filter expressions appropriately.

Do not filter the data only on the frontend after retrieving unrelated data.

The filtering should happen through the Google Analytics API wherever supported.

---

## 8. Example API Request

A filtered GA4 report should conceptually support something similar to:

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
      "name": "activeUsers"
    },
    {
      "name": "screenPageViews"
    }
  ],
  "dimensionFilter": {
    "andGroup": {
      "expressions": [
        {
          "filter": {
            "fieldName": "country",
            "stringFilter": {
              "matchType": "EXACT",
              "value": "India"
            }
          }
        },
        {
          "filter": {
            "fieldName": "userAgeBracket",
            "stringFilter": {
              "matchType": "EXACT",
              "value": "25-34"
            }
          }
        }
      ]
    }
  }
}
```

Use the project's existing date-range implementation instead of hard-coding dates.

---

## 9. Backend Architecture

Follow the existing Google Analytics backend architecture.

Prefer reusable APIs instead of creating a separate endpoint for every filter.

For example, if appropriate for the existing architecture:

```text
GET /api/analytics/demographics
```

with query parameters such as:

```text
?country=India
&region=Tamil Nadu
&city=Madurai
&language=en
&age=25-34
&gender=male
```

However, first inspect the existing API architecture and follow its established conventions.

Do not force this exact endpoint structure if the existing project has a better pattern.

---

## 10. Filter Options API

If necessary, create a reusable endpoint for retrieving filter options.

For example:

```text
GET /api/analytics/demographics/options
```

Possible response:

```json
{
  "countries": [
    "India",
    "United States",
    "United Kingdom"
  ],
  "regions": [
    "Tamil Nadu",
    "Karnataka"
  ],
  "cities": [
    "Madurai",
    "Chennai",
    "Bengaluru"
  ],
  "languages": [
    "en",
    "ta",
    "hi"
  ],
  "ages": [
    "18-24",
    "25-34",
    "35-44"
  ],
  "genders": [
    "male",
    "female",
    "unknown"
  ],
  "interests": []
}
```

Only include fields that are actually supported by the GA4 property/API.

---

## 11. Dashboard Behavior

The demographic filters should work together with the existing analytics reports.

For example:

```text
Google Analytics Dashboard

Date Range
[ All Time ▼ ]

Demographic Filters

Country       [ India ▼ ]
Region        [ Tamil Nadu ▼ ]
Town/City     [ Madurai ▼ ]
Language      [ English ▼ ]
Age           [ 25-34 ▼ ]
Gender        [ Male ▼ ]
Interests     [ All Interests ▼ ]

              [Apply Filters]


Analytics Reports
────────────────────────────────

Top 15 Pages by Views

Page                         Views
/home                        5,240
/products                    3,820
/pricing                     2,130

────────────────────────────────

Top Countries by Views

India                        12,450
United States                 8,230
United Kingdom                3,120
```

When the filters change and the user clicks **Apply Filters**, refresh the relevant reports.

---

## 12. Reset Filters

Add a:

```text
Reset Filters
```

action.

When clicked:

- Country → All
- Region → All
- Town/City → All
- Language → All
- Age → All
- Gender → All
- Interests → All

Then reload the analytics reports using the unfiltered state.

---

## 13. Loading State

Use the existing analytics loading/skeleton components.

For example:

```text
Country       [ Loading... ]
Region        [ Loading... ]
Town/City     [ Loading... ]
```

Do not freeze the entire dashboard while only one filter's options are loading.

---

## 14. Error Handling

If GA4 API requests fail:

- Do not crash the dashboard.
- Display the existing analytics error UI.
- Provide a meaningful error message.
- Log detailed errors only on the server.
- Never expose access tokens, refresh tokens, client secrets, or OAuth credentials.

If a specific demographic dimension is unavailable, show an appropriate message instead of returning fake data.

Example:

```text
Interest data is not available for this Google Analytics property.
```

---

## 15. Privacy / Thresholding

Demographic data such as age and gender can be subject to Google Analytics privacy protections and thresholding.

Therefore:

- Do not assume every demographic category will always return data.
- Handle empty/limited results gracefully.
- Do not attempt to reconstruct hidden demographic data.
- Do not display fabricated values.

---

## 16. Property Metadata

Before implementing the filters, use the GA4 property metadata capability to verify which dimensions and metrics are actually available for the connected property.

This is particularly important for:

- Age
- Gender
- Interests

The implementation should be based on the property's actual available metadata rather than assuming that every GA4 UI dimension is available through the Data API.

---

## 17. Existing Analytics Reports Must Continue Working

Do NOT break the existing:

- Top 15 Pages by Views
- Top 15 Countries by Views
- Other existing Google Analytics reports

Refactor shared Google Analytics code only when necessary.

Prefer reusable functions such as:

```text
runAnalyticsReport()
buildDimensionFilter()
getDimensionOptions()
getAnalyticsMetadata()
```

if they fit the existing architecture.

---

## 18. Security Requirements

Never expose the following to the frontend:

- Google Client Secret
- Refresh Token
- Access Token
- OAuth credentials

All Google Analytics API communication requiring credentials must remain server-side.

The frontend should communicate only with the application's backend/API.

---

## 19. Final Testing

After implementation, verify all of the following:

### Country

- Country dropdown loads real GA4 values.
- Selecting a country filters reports correctly.

### Region

- Region values are loaded dynamically.
- Region responds correctly to country selection.

### Town/City

- City values correspond to the selected country/region.
- Changing country resets incompatible city selections.

### Language

- Language values come from GA4.
- Language filtering works.

### Age

- `userAgeBracket` is used where supported.
- Age filtering works.
- Empty/thresholded data is handled correctly.

### Gender

- `userGender` is used where supported.
- Gender filtering works.
- Empty/thresholded data is handled correctly.

### Interests

- Verify whether the required interest data is actually available through the GA4 API.
- Do not invent an `interests` dimension.
- If unsupported, show a clear unavailable state.

### General

- Existing analytics reports still work.
- Filters can be reset.
- Loading states work.
- Error states work.
- No fake data is displayed.
- No credentials are exposed.
- Responsive UI works on desktop and mobile.

## Final Output

After implementation, provide:

1. Files changed
2. Components added/modified
3. Backend APIs added/modified
4. GA4 dimensions used
5. Filter implementation details
6. How cascading Country → Region → Town/City works
7. How Interests was handled
8. Any new environment variables, if required
9. Local testing steps
10. Any GA4/Data API limitations discovered during implementation

Do not modify the existing Google Analytics OAuth configuration unless it is genuinely required.