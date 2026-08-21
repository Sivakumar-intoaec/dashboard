Implement a new "Page Performance" module in the existing website to display Google PageSpeed Insights and Core Web Vitals data.

Before making changes, inspect the existing project structure, frontend architecture, backend/API structure, environment variables, and existing Analytics modules. Reuse the existing design system, components, API patterns, loading states, error handling, and responsive layout.

Do not modify or break the existing Google Analytics/GA4 functionality.

### 1. Page Performance module

Add a new section/module called:

"Page Performance"

The user should be able to enter or select a website URL and run a PageSpeed analysis.

Example UI:

Page Performance

[ Enter URL ................................ ] [ Analyze ]

[ Mobile ] [ Desktop ]

After analysis, display the performance results.

### 2. PageSpeed Insights API

Integrate the Google PageSpeed Insights API through the backend.

Do not call the PageSpeed API directly from the browser if that would expose the API key.

Create a secure backend endpoint such as:

POST /api/pagespeed/analyze

Request:

{
"url": "https://example.com/",
"strategy": "mobile"
}

The backend should call the PageSpeed Insights API and return only the required data to the frontend.

Use an environment variable for the PageSpeed API key.

Example:

PAGESPEED_API_KEY=...

Never expose the API key in frontend code or client-side responses.

### 3. Mobile and Desktop

Provide two analysis options:

* Mobile
* Desktop

When Mobile is selected, request PageSpeed using:

strategy=mobile

When Desktop is selected, request:

strategy=desktop

Allow the user to switch between Mobile and Desktop and run the corresponding analysis.

### 4. Performance score

Display the Lighthouse Performance score prominently.

Example:

Performance

82 / 100

Use an appropriate visual indicator for the score.

Also display:

* Accessibility
* Best Practices
* SEO

if those categories are available in the API response.

### 5. Core Web Vitals

Create a dedicated "Core Web Vitals" section.

Display:

* Largest Contentful Paint (LCP)
* Interaction to Next Paint (INP)
* Cumulative Layout Shift (CLS)

For each metric display:

* Metric name
* Value
* Unit
* Status

Example:

Core Web Vitals

LCP
2.1 s
Good

INP
180 ms
Good

CLS
0.08
Good

Use the actual values returned by the API.

Do not hardcode metric values.

### 6. Additional performance metrics

Display additional Lighthouse metrics where available:

* First Contentful Paint (FCP)
* Time to First Byte (TTFB)
* Speed Index
* Total Blocking Time (TBT)

Clearly distinguish Core Web Vitals from other performance metrics.

### 7. Status classification

Classify the metrics based on Google's supported thresholds.

For example:

LCP:

* Good
* Needs improvement
* Poor

INP:

* Good
* Needs improvement
* Poor

CLS:

* Good
* Needs improvement
* Poor

Display the status next to each metric.

Do not invent custom thresholds if the official Google thresholds are available from the API/documentation.

### 8. Field data vs Lab data

Clearly distinguish between:

* Real-user/field data
* Lighthouse/lab data

If field data is available for the analyzed URL, display it separately from Lighthouse results.

Example:

Core Web Vitals

## Real User Data

LCP       2.1s
INP       180ms
CLS       0.08

## Lab Data

LCP       1.8s
TBT       120ms
CLS       0.05

Do not label Lighthouse results as real-user data.

If field data is unavailable, show:

"Real-user data is not available for this URL."

### 9. Page URL

Show the analyzed URL above the results.

Example:

Analyzed URL:
https://example.com/pricing/

Allow the user to analyze another URL without refreshing the entire website.

### 10. Loading state

When analysis is running, display a proper loading state.

Example:

Analyzing page performance...

Do not freeze the rest of the dashboard.

Disable the Analyze button while the request is running to prevent duplicate API requests.

### 11. Error handling

Handle:

* Invalid URL
* Empty URL
* PageSpeed API errors
* API key errors
* Rate limits
* Network errors
* URL that cannot be analyzed
* Missing Lighthouse data
* Missing field/CrUX data

Display a user-friendly error message instead of exposing raw backend/API errors.

### 12. UI design

Match the existing website's UI and styling.

Create a clean dashboard layout such as:

Page Performance

[ URL ........................................ ] [ Analyze ]

[ Mobile ] [ Desktop ]

┌──────────────────────────────────────────────┐
│ Performance                                  │
│                                              │
│              82 / 100                        │
│                                              │
│ Accessibility     94                         │
│ Best Practices    96                         │
│ SEO               100                        │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ Core Web Vitals                              │
│                                              │
│ LCP     2.1s       Good                      │
│ INP     180ms      Good                      │
│ CLS     0.08       Good                      │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ Other Performance Metrics                   │
│                                              │
│ FCP        1.5s                              │
│ TTFB       0.8s                              │
│ Speed Index 2.4s                             │
│ TBT        120ms                             │
└──────────────────────────────────────────────┘

### 13. API response handling

Do not send the entire raw PageSpeed API response to the frontend unless necessary.

Create a normalized response structure such as:

{
"success": true,
"url": "...",
"strategy": "mobile",
"scores": {
"performance": 82,
"accessibility": 94,
"bestPractices": 96,
"seo": 100
},
"coreWebVitals": {
"lcp": {
"value": 2.1,
"unit": "s",
"status": "good"
},
"inp": {
"value": 180,
"unit": "ms",
"status": "good"
},
"cls": {
"value": 0.08,
"unit": "",
"status": "good"
}
},
"metrics": {
"fcp": "...",
"ttfb": "...",
"speedIndex": "...",
"tbt": "..."
}
}

Adapt this structure to the actual PageSpeed API response rather than assuming every field will always exist.

### 14. Caching

Avoid unnecessary repeated PageSpeed API requests.

If the existing project has a caching mechanism, reuse it.

Otherwise implement a reasonable server-side cache for repeated URL + strategy combinations.

Do not cache indefinitely.

### 15. Security

Keep the PageSpeed API key server-side.

Do not put the key in:

* React/Next.js client components
* Browser requests
* Public environment variables
* HTML
* Git repository

Use the existing environment-variable pattern in the project.

### 16. Important implementation rule

First inspect the existing project.

Identify:

* Frontend framework
* Backend/server implementation
* Existing API routes
* Existing Analytics components
* Existing environment-variable handling
* Existing dashboard card/table components

Reuse those patterns instead of introducing a completely new architecture.

Do not modify the existing GA4 OAuth implementation.

The final implementation should integrate naturally into the existing Analytics dashboard and should be production-ready, responsive, and error-tolerant.
