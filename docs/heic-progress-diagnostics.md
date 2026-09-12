# HEIC progress diagnostics

The HEIC converter exposes phase-based progress so production testing can identify where browser-side conversion stops.

Stages:
- 10% decoder loaded
- 25% decoding HEIC
- 65% checking JPG output
- 80% building preview
- 95% finalizing download
- 100% complete or stopped

The converter page shows build marker `heic-v4` and cache-busts its CSS and JavaScript assets so testers can confirm the new build is loaded.
