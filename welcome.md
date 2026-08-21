Update the existing Google Analytics 4 Analytics module to make the existing "Top 15 Pages by Views" report behave like the Google Analytics table shown in the reference screenshot.

IMPORTANT:
Do not create a new GA4 OAuth flow.
Do not change the existing authentication.
Reuse the existing GA4 OAuth, property ID, API service, date range handling, and backend filter infrastructure.

The existing backend already supports:

* Dynamic GA4 dimensions
* Country filtering
* Device filtering
* Traffic source filtering
* /api/analytics/dimension-values
* /api/analytics/filter

Reuse these existing implementations instead of duplicating them.

### 1. Modify the Top Pages report

The existing Top 15 Pages by Views section should remain the main table.

Keep the existing page dimension:

* Page path and screen class

Add a filter/dimension control next to it, similar to Google Analytics.

Example:

[ Page path and screen class ▼ ]    [ Country ▼ ]

The controls should have the same compact style as the Google Analytics screenshot.

### 2. Country filter

When the user clicks the Country dropdown, show the available countries dynamically from GA4.

Do NOT hardcode countries.

Use the existing:

GET /api/analytics/dimension-values?dimension=country

to retrieve available values.

Example menu:

## Search items

Geography >
Country >

Then display the available country values:

India
United States
Australia
Malaysia
United Kingdom
...

Allow the user to select a country.

### 3. Apply Country to the Top Pages report

When the user selects:

Country → India

apply the country filter to the existing Top Pages GA4 query.

The result should update the same Top Pages table.

Example:

Before:

## Page                         Views

/                            4,662
/en-my/                       988
/pricing/                     688
/schedule-demo/               504

After selecting Country = India:

## Page                         Country       Views

/                            India         3,819
/pricing/                    India           302
/en-my/                      India           229
/blog/                       India           204

Do not create a separate country table for this interaction.

The existing "Top 15 Countries" report can remain unchanged.

### 4. Support secondary dimensions

Implement the page report so it can optionally request:

pagePath + country

instead of only:

pagePath

For example, when Country is selected, the GA4 request should use:

dimensions:

* pagePath
* country

metrics:

* screenPageViews
* activeUsers
* views per active user
* average engagement time
* eventCount
* keyEvents
* totalRevenue

Use the existing metrics already displayed by the Analytics table wherever possible.

### 5. Support actual filtering

There are two states:

Default:

[ Page path and screen class ▼ ]

Show the normal Top 15 Pages report.

After selecting Country:

[ Page path and screen class ▼ ] [ Country: India × ]

Show only page data matching Country = India.

If the UI supports displaying the selected Country as a second column, show:

## Page path                    Country

/                            India
/pricing/                    India
/en-my/                      India
/blog/                       India

### 6. Filter chips

When a filter is selected, display it as a removable chip.

Example:

[ Country: India × ]

If multiple filters are selected:

[ Country: India × ] [ Device: Mobile × ] [ Source: Google × ]

Clicking × should remove only that filter and reload the report.

Add a "Clear all" option when multiple filters are active.

### 7. Preserve the existing Top 15 Country report

Do NOT remove or redesign the existing Top 15 Countries section.

The dashboard should continue to have:

1. Top 15 Countries by views
2. Top 15 Pages by views

The new filter functionality should primarily enhance the Top 15 Pages table.

### 8. Extend the same behavior to other dimensions

Build the filter component as reusable functionality.

It should support:

Geography:

* Country
* Region
* City
* Continent

Traffic source:

* Session source
* Session medium
* Session source / medium
* Session campaign
* Default channel group

Platform / device:

* Device category
* Operating system
* Browser
* Platform

Use the existing GA4 dimension mapping already implemented in the backend.

### 9. Backend requirements

Do not create duplicate API endpoints if the existing endpoints can be reused.

Use the existing:

POST /api/analytics/filter

and extend the existing Top Pages query if necessary so that it can return page-level data with the selected dimension/filter.

The backend should dynamically construct the GA4 dimensionFilter.

For example:

Country = India

should result in a GA4 dimension filter equivalent to:

country EXACT India

Multiple filters should continue to use AND logic as already implemented.

### 10. Frontend behavior

The complete interaction should be:

User opens Analytics
↓
Top 15 Pages table is displayed
↓
User clicks filter/dropdown
↓
Selects Geography
↓
Selects Country
↓
Available countries are loaded from GA4
↓
User selects India
↓
"Country: India" appears as a filter chip
↓
Top Pages data is refreshed
↓
Only India-related page data is displayed

The UI should closely match the Google Analytics screenshot:

* Compact dropdown
* Searchable menu
* Nested categories
* Right arrow for nested options
* Selected filter displayed beside the page dimension
* × icon to remove filter
* Clean Google Analytics–style spacing and borders

### 11. Do not break existing functionality

Keep all existing:

* GA4 OAuth
* Refresh token handling
* Property configuration
* Top 15 Countries
* Top 15 Pages
* Analytics metrics
* Date range
* Existing API endpoints
* Existing dashboard layout

Only enhance the Top Pages report with the Google Analytics-style dynamic filtering behavior.

Before implementing, inspect the existing frontend and backend code and reuse existing functions/components wherever possible instead of creating duplicate GA4 logic.
