const Config = require("./helper/export-env")(
    "DB_PATH",
    "ACCESS_TOKEN",
    "SOURCE_PATH"
)

const Database = require('better-sqlite3')
const fs = require('fs')

// Database configuration
const db = new Database(Config["DB_PATH"])

// Function to fetch data from the database
function fetchData() {
  const stmt = db.prepare('SELECT * FROM data')
  const data = stmt.all()
  return data
}

// Fetch data from the database
const alertData = fetchData()

// Convert data to GeoJSON format
const geojsonData = {
  "type": "FeatureCollection",
  "features": alertData.map(alert => ({
    "type": "Feature",
    "geometry": {
      "type": "Point",
      "coordinates": [alert.longitude, alert.latitude]
    },
    "properties": {
      "uuid": alert.uuid,
      "type": alert.type,
      "pubMillis": alert.pubMillis
    }
  }))
}

// Save GeoJSON data to a file
fs.writeFileSync(`${Config["SOURCE_PATH"]}/alerts.json`, JSON.stringify(geojsonData))

// Generate HTML content
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Waze Alerts Heatmap</title>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js"></script>
<style>
body { margin: 0; padding: 0; }
#map { position: absolute; top: 0; bottom: 0; width: 100%; }
</style>
</head>
<body>
<div id="map"></div>

<script>
  // TO MAKE THE MAP APPEAR YOU MUST
  // ADD YOUR ACCESS TOKEN FROM
  // https://account.mapbox.com
  mapboxgl.accessToken = '${Config["ACCESS_TOKEN"]}'; // Replace with your Mapbox access token
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [134.2383, -23.6980], // Center the map on Australia
    zoom: 4
  })

  map.on('load', () => {
    // Add the GeoJSON source
    map.addSource('alerts', {
      type: 'geojson',
      data: './alerts.json' // Path to the generated GeoJSON file
    })

    // Add a heatmap layer
    map.addLayer({
      id: 'alerts-heat',
      type: 'heatmap',
      source: 'alerts',
      maxzoom: 9,
      paint: {
        'heatmap-weight': ['get', 'mag'],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(33,102,172,0)',
          0.2,
          'rgb(103,169,207)',
          0.4,
          'rgb(209,229,240)',
          0.6,
          'rgb(253,219,199)',
          0.8,
          'rgb(239,138,98)',
          1,
          'rgb(178,24,43)'
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0]
      }
    }, 'waterway-label')

    // Add a circle layer for individual alerts
    map.addLayer({
      id: 'alerts-point',
      type: 'circle',
      source: 'alerts',
      minzoom: 7,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 1, 16, 5],
        'circle-color': [
          'match',
          ['get', 'type'],
          'ACCIDENT',
          'orange',
          'JAM',
          'red',
          'HAZARD',
          'yellow',
          'WEATHERHAZARD',
          'blue',
          'POLICE',
          'cyan',
          'ROAD_CLOSED',
          'purple',
          /* Add more types and colors as needed */
          'gray' // Default color
        ],
        'circle-stroke-color': 'white',
        'circle-stroke-width': 1,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1]
      }
    }, 'waterway-label')
  })
</script>

</body>
</html>
`

// Save HTML content to a file
fs.writeFileSync(`${Config["SOURCE_PATH"]}/index.html`, htmlContent)

// Log success message
console.log('Static HTML file generated successfully!')
