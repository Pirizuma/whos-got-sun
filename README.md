# Family Weather Compare (AU)

A simple, family-friendly weather comparison page for:
- Adelaide
- Darwin
- Melbourne
- Sydney

Shows **current or peak** conditions (temp, feels like, UV, wind) for four cities side-by-side in responsive cards.

## Setup (WeatherAPI.com)

1. Create a free WeatherAPI account and get an API key:
   - https://www.weatherapi.com/
2. Open `app.js` and replace the placeholder:

```js
const WEATHERAPI_KEY = "YOUR_WEATHERAPI_KEY_HERE";
```

## Run locally

Because the page calls a remote API, run it via a small local server (recommended).

### Option A: Ruby (often preinstalled on macOS)

From this folder:

```bash
ruby -run -e httpd . -p 8080
```

Then open:
- `http://localhost:8080`

### Option B: Python

```bash
python3 -m http.server 8080
```

### Option C: Node

```bash
npx serve .
```

## Notes

- **Auto-refresh**: every 30 minutes.
- **Last updated**: each card shows the provider’s local “last updated” time; the header shows your last refresh time.
- **UV colors**: low/moderate/high/extreme are color-coded.
- **Emoji style**: Weather icons use [Twemoji](https://github.com/twitter/twemoji) when the CDN script loads (consistent cross-platform look). To use native/system emoji instead, remove the Twemoji script from `index.html`. Other options: [Noto Emoji](https://fonts.google.com/noto/specimen/Noto+Color+Emoji) or a weather icon font (e.g. Weather Icons) could be wired in similarly.

