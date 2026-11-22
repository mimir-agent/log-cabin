#!/usr/bin/env bash
# Renders the app icons in static/icons/ from the mark. Run it after changing either SVG.
# The colours in the SVGs are hex because librsvg can't read oklch: #171717 is --hue-gray-900,
# #f78757 is --hue-orange-500 and #f4c698 is --hue-amber-300.
# The maskable icon fills the square and keeps the flame inside the central 80% circle that
# launchers may crop to; iOS rounds the corners of the apple-touch-icon itself.
set -euo pipefail
cd "$(dirname "$0")/.."
assets=src/lib/assets
out=static/icons
mkdir -p "$out"
magick -background none "$assets/mark.svg" -resize 192x192 -depth 8 -strip "$out/icon-192.png"
magick -background none "$assets/mark.svg" -resize 512x512 -depth 8 -strip "$out/icon-512.png"
magick "$assets/mark-maskable.svg" -resize 512x512 -depth 8 -strip "$out/maskable-512.png"
magick "$assets/mark-maskable.svg" -resize 180x180 -depth 8 -strip "$out/apple-touch-icon.png"
