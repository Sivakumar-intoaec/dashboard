Implement a new **Core Web Vitals** module in my existing website.

### Important

Do NOT modify or break any existing functionality, especially:

* Google Search Console integration
* Top 15 Landing Pages
* Indexing module
* Performance
* Countries
* Queries
* Existing `/api/gsc` endpoint
* Existing OAuth implementation

Create Core Web Vitals as a **separate module**.

### Requirements

1. Add a new navigation item:

```text
Search Console
├── Performance
├── Top 15 Landing Pages
├── Countries
├── Queries
├── Indexing
└── Core Web Vitals
```

2. Use Google's **Chrome UX Report (CrUX) API** to retrieve real-user Core Web Vitals data.

3. Display these three current Core Web Vitals:

```text
LCP
INP
CLS
```

4. Support:

```text
[ Mobile ] [ Desktop ]
```

5. Display each metric with its value and status:

```text
LCP
2.1 s
✓ Good

INP
180 ms
✓ Good

CLS
0.08
✓ Good
```

6. Use these thresholds:

```text
LCP:
Good ≤ 2.5s
Needs Improvement ≤ 4s
Poor > 4s

INP:
Good ≤ 200ms
Needs Improvement ≤ 500ms
Poor > 500ms

CLS:
Good ≤ 0.1
Needs Improvement ≤ 0.25
Poor > 0.25
```

7. Display the distribution when available:

```text
LCP

Good: 72%
Needs Improvement: 20%
Poor: 8%
```

Do the same for INP and CLS.

8. Add an overall status:

```text
✓ Good
⚠ Needs Improvement
✗ Poor
```

If data is unavailable, show:

```text
No Core Web Vitals data available
```

Do not treat missing data as Poor.

9. Create a separate backend endpoint:

```text
GET /api/core-web-vitals
```

Example:

```text
/api/core-web-vitals?url=https://intoaec.ai&device=mobile
```

10. Keep all API keys and credentials on the backend.

If required, add:

```text
CRUX_API_KEY
```

to the server environment variables.

Never expose the API key to the frontend.

11. Add server-side caching, preferably around 1 hour, so the CrUX API is not called unnecessarily on every page load.

12. Add a **Refresh** button to bypass the cache and fetch fresh data.

13. Reuse the existing project's UI components, styling, charts, API structure, and caching utilities where possible.

14. Do not hard-code any Core Web Vitals values. All displayed values must come from the CrUX API.

15. Handle API errors, invalid URLs, missing data, and loading states properly.

### Expected UI

```text
Core Web Vitals

URL: https://intoaec.ai

[ Mobile ] [ Desktop ]

Overall: ✓ Good

┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ LCP         │ │ INP         │ │ CLS         │
│ 2.1 s       │ │ 180 ms      │ │ 0.08        │
│ ✓ Good      │ │ ✓ Good      │ │ ✓ Good      │
└─────────────┘ └─────────────┘ └─────────────┘

LCP
Good: 72%
Needs Improvement: 20%
Poor: 8%

INP
Good: 80%
Needs Improvement: 15%
Poor: 5%

CLS
Good: 91%
Needs Improvement: 6%
Poor: 3%

[ Refresh ]
```

Before implementing, inspect the existing project structure and reuse existing components and conventions. Make the smallest changes necessary and verify that all existing Search Console modules continue to work.
