# Aurora Borealis Viewer

A quick-glance phone dashboard that answers one question: is it worth going out to look for the aurora, and when?

Live at **https://kugothepup.github.io/musical-eureka/** once GitHub Pages is switched on (Settings → Pages → Deploy from a branch → `main` / root).

## What it shows

- **Headline answer**: Go now / Maybe / Not yet / Unlikely. It combines aurora activity at your location, cloud cover, darkness and moonlight. Before dark it answers for tonight, and if it's quiet now but busier later it says when.
- **Tonight**: an hour-by-hour chart of the night ahead with the best window marked. Taller bars mean a better chance, the colour shows how active the aurora is, and the strip underneath shows daylight, twilight, darkness and moonlight.
- **Conditions**: when it gets dark, cloud and rain (thin high cloud counts for less than low cloud), temperature, and the Moon's phase and when it rises or sets.
- **Why this answer?**: the evidence, in plain language. That covers the NOAA OVATION model, Kp with a 48-hour chart, AuroraWatch UK (shown in the UK and Ireland only) and the solar wind, which can give about an hour's warning.

## Made for using outside at night

- **Night mode** (moon button): a dim, all-red screen that keeps your eyes dark-adapted. It also keeps the screen on, so you don't have to unlock a bright phone in the dark.
- **Works offline**: add it to your home screen. It keeps the last readings and says how old they are. On weak signal it opens the saved copy after a few seconds instead of waiting.
- **Pull down to refresh**. It also refreshes itself every 5 minutes, and marks the headline when the answer changes.
- Status markers use a shape as well as a colour (✓ ! ✕).

## Data sources

NOAA Space Weather Prediction Center, AuroraWatch UK (Lancaster University), Open-Meteo (CC BY 4.0). Everything is fetched directly by your browser, and the font is served from this site. There's no server and no tracking.

The thresholds in `CFG` at the top of the script are rules of thumb, and you can tune them. Aurora forecasts are probabilities, not promises.

## Tests

The forecast logic in `index.html` sits between `//<pure>` markers so it can be tested without a browser. Run `node --test` (Node 18 or newer, nothing to install). GitHub Actions runs the same tests on every push.

Poppins is included under the SIL Open Font License (`fonts/OFL.txt`).
