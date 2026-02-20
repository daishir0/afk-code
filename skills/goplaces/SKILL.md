---
name: goplaces
description: Location and map search using Apple Maps URL scheme, Google Maps URLs, and geocoding. Search places, get directions, and look up coordinates.
---

# Location & Map Search (macOS)

Search for places, get directions, and perform geocoding using Apple Maps, Google Maps URLs, and command-line tools.

## Operations

### 1. Open a Location in Apple Maps

**Search for a place:**
```bash
open "maps://?q=Tokyo+Tower"
```

**Open specific coordinates:**
```bash
open "maps://?ll=35.6586,139.7454"
```

**Search near a location:**
```bash
open "maps://?q=coffee&sll=35.6586,139.7454&z=15"
```

Parameters:
- `q`: Search query (URL-encoded)
- `ll`: Latitude,longitude to center the map
- `sll`: Latitude,longitude for search center
- `z`: Zoom level (2-21, higher = more zoomed)
- `t`: Map type: `m` (standard), `k` (satellite), `h` (hybrid), `r` (transit)

### 2. Get Directions in Apple Maps

```bash
open "maps://?saddr=Tokyo+Station&daddr=Shibuya+Station&dirflg=r"
```

Parameters:
- `saddr`: Start address or coordinates (URL-encoded). Use `Current+Location` for current location.
- `daddr`: Destination address or coordinates (URL-encoded)
- `dirflg`: Direction mode: `d` (driving), `w` (walking), `r` (transit)

**Multiple waypoints:**
```bash
open "maps://?saddr=Tokyo+Station&daddr=Shibuya+Station+to:Shinjuku+Station"
```

### 3. Open in Google Maps (Browser)

**Search:**
```bash
open "https://www.google.com/maps/search/?api=1&query=Tokyo+Tower"
```

**Directions:**
```bash
open "https://www.google.com/maps/dir/?api=1&origin=Tokyo+Station&destination=Shibuya+Station&travelmode=transit"
```

Parameters:
- `query`: Search query
- `origin`: Start location
- `destination`: End location
- `travelmode`: `driving`, `walking`, `bicycling`, `transit`
- `query_place_id`: Google Place ID for precise location

**View specific coordinates:**
```bash
open "https://www.google.com/maps/@35.6586,139.7454,15z"
```

### 4. Geocoding (Address to Coordinates)

**Using macOS CoreLocation (via Python):**

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import subprocess, json
result = subprocess.run(
    ['osascript', '-e', '''
    use framework \"CoreLocation\"
    use scripting additions

    set geocoder to current application's CLGeocoder's alloc()'s init()
    set resultRef to {missing value}

    geocoder's geocodeAddressString:\"Tokyo Tower\" completionHandler:(void)
    delay 3

    -- Note: AppleScript geocoding is limited; use curl approach below instead
    '''],
    capture_output=True, text=True
)
print(result.stdout)
"
```

**Using Nominatim (OpenStreetMap, no API key required):**

```bash
curl -s "https://nominatim.openstreetmap.org/search?q=Tokyo+Tower&format=json&limit=5" \
  -H "User-Agent: ClaudeCodeSkill/1.0" | python3 -c "
import sys, json
results = json.load(sys.stdin)
for r in results:
    print(f\"{r['display_name']}\")
    print(f\"  Lat: {r['lat']}, Lon: {r['lon']}\")
    print()
"
```

### 5. Reverse Geocoding (Coordinates to Address)

```bash
curl -s "https://nominatim.openstreetmap.org/reverse?lat=35.6586&lon=139.7454&format=json" \
  -H "User-Agent: ClaudeCodeSkill/1.0" | python3 -c "
import sys, json
result = json.load(sys.stdin)
print(f\"Address: {result.get('display_name', 'N/A')}\")
"
```

### 6. Place Search (Nearby)

**Using Nominatim:**

```bash
curl -s "https://nominatim.openstreetmap.org/search?q=coffee+near+Shibuya+Tokyo&format=json&limit=10" \
  -H "User-Agent: ClaudeCodeSkill/1.0" | python3 -c "
import sys, json
results = json.load(sys.stdin)
for i, r in enumerate(results, 1):
    print(f\"{i}. {r['display_name']}\")
    print(f\"   Lat: {r['lat']}, Lon: {r['lon']}\")
    print(f\"   Type: {r.get('type', 'N/A')}\")
    print()
"
```

### 7. Distance Calculation

**Calculate straight-line distance between two points:**

```bash
python3 -c "
import math

def haversine(lat1, lon1, lat2, lon2):
    R = 6371  # Earth's radius in km
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

# Example: Tokyo Station to Shibuya Station
dist = haversine(35.6812, 139.7671, 35.6580, 139.7016)
print(f'Distance: {dist:.2f} km')
"
```

### 8. Open Street View

```bash
# Google Street View at coordinates
open "https://www.google.com/maps/@35.6586,139.7454,3a,75y,90t/data=!3m6!1e1!3m4!1s0!2e0!7i16384!8i8192"
```

### 9. Share/Embed a Location

**Generate a shareable Google Maps link:**
```bash
echo "https://www.google.com/maps/place/35.6586,139.7454"
```

**Generate an Apple Maps link:**
```bash
echo "https://maps.apple.com/?ll=35.6586,139.7454&q=Tokyo+Tower"
```

## URL Encoding

Always URL-encode addresses and search queries:

```bash
python3 -c "import urllib.parse; print(urllib.parse.quote('Shibuya Crossing, Tokyo'))"
```

## Notes

- **Nominatim (OpenStreetMap)**: Free, no API key required. Please respect the usage policy (max 1 request/second, include User-Agent header).
- **Apple Maps URL scheme**: Opens the Maps app directly on macOS.
- **Google Maps URLs**: Opens in the default web browser.
- For production-grade geocoding with higher rate limits, consider using Google Maps Geocoding API (requires API key).
- Coordinates use decimal degrees format (latitude, longitude).
- When using `open` command on macOS, the appropriate app or browser will handle the URL automatically.
