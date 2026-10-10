# Aurora Borealis Viewer

A quick-glance phone dashboard that answers one question: is it worth going out to look for the aurora, and when?

Live at **https://kugothepup.github.io/musical-eureka/** once GitHub Pages is switched on (Settings → Pages → Deploy from a branch → `main` / root).

## What it shows

- **Headline answer**: Go now / Maybe / Not yet / Unlikely. It combines aurora activity at your location, cloud cover and darkness.
- **Tonight**: an hour-by-hour bar for the night ahead and the best window to look.
- **Conditions**: when it gets dark, cloud and rain, temperature, moon.
- **Why this answer?**: the evidence, in plain language. That covers the NOAA OVATION model, Kp with a 48-hour chart, AuroraWatch UK (shown near the UK only) and the solar wind.

## Made for using outside at night

- **Night mode** (moon button): a dim, all-red screen that keeps your eyes dark-adapted.
- **Works offline**: add it to your home screen. It keeps the last readings and says how old they are.
- **Pull down to refresh**. It also refreshes itself every 5 minutes, and marks the headline when the answer changes.
- Status markers use a shape as well as a colour (✓ ! ✕).

## Data sources

NOAA Space Weather Prediction Center, AuroraWatch UK (Lancaster University), Open-Meteo (CC BY 4.0). Everything is fetched directly by your browser. There's no server and no tracking.

The thresholds in `CFG` at the top of the script are rules of thumb, and you can tune them. Aurora forecasts are probabilities, not promises.
