const Config = require("./helper/export-env")(
  "DB_PATH",
  "ACCESS_TOKEN",
  "SOURCE_PATH"
)

const Alerts = require("./alert-types.json")
const Database = require('better-sqlite3');
const fs = require('fs');

// Database configuration
const db = new Database(Config["DB_PATH"]);

// Function to fetch data from the database
function fetchData() {
  const stmt = db.prepare('SELECT * FROM data');
  const data = stmt.all();
  return data;
}

// Fetch data from the database
const alertData = fetchData();

// Put it in GeoJSON format
const alertFeatures = alertData.map(alert => ({
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [alert.longitude, alert.latitude]
  },
  "properties": {
    "type": alert.type,
    "pubMillis": alert.pubMillis,
    "display": Alerts["display"][alert.type],
    "parentType": getParentType(alert.type) // Add parent type information
  }
}))

// Create an array of indices
const indices = alertData.map((_, index) => index);

// Sort the indices based on the EPOCH
const sortedIndicesByEPOCH = indices.sort((a, b) => alertData[a].pubMillis - alertData[b].pubMillis);

// Sort the indices based on the longitude
const sortedIndicesByLongitude = indices.sort((a, b) => alertData[a].longitude - alertData[b].longitude);

// Sort the indices based on the latitude
const sortedIndicesByLatitude = indices.sort((a, b) => alertData[a].latitude - alertData[b].latitude);

// Convert data to GeoJSON format
const geojsonData = {
  "type": "FeatureCollection",
  "features": alertFeatures
}

const sortedData = {
  "epoch": sortedIndicesByEPOCH,
  "longitude": sortedIndicesByLongitude,
  "latitude": sortedIndicesByLatitude
}

// Save GeoJSON data to a file
fs.writeFileSync(`${Config["SOURCE_PATH"]}/geojson.json`, JSON.stringify(geojsonData))
fs.writeFileSync(`${Config["SOURCE_PATH"]}/sorted.json`, JSON.stringify(sortedData))

const alertColours = {};

const ColourMap = [
  'red', // ACCIDENT
  'yellow', // HAZARD
  'purple', // ROAD CLOSED
  'orange', // JAM
  'cyan' // POLICE
]

Object.values(Alerts.types).forEach(index => {
  alertColours[index] = ColourMap[index]
  getChildrenIterable(index).forEach(subIndex => {
    alertColours[subIndex] = ColourMap[index]
  })
})

function getChildrenIterable(index) {
  const start = Alerts.children[index][0]
  const end = Alerts.children[index][1]
  const arr = []

  for (let i = start; i <= end; i++) {
    arr.push(i)
  }

  return arr
}

// Function to get the parent type of a subtype
function getParentType(subtype) {
  for (const [parentType, range] of Object.entries(Alerts.children)) {
    if (subtype >= range[0] && subtype <= range[1]) {
      return Alerts.display[parentType];
    }
  }
  return null; // Or handle cases where a parent type might not be found
}

function displayFiltersHTML() {
  return Object.entries(Alerts.types).map(([type, index]) => `
    <div id="${Alerts.display[index]}-container" style="display:none;">
      <h3>${Alerts.display[index]}</h3>
      <span style="user-select: none;">
        <input type="checkbox" id="${Alerts.display[index]}" name="alertType" value="${Alerts.display[index]}" checked onclick="updateAlertFilter()"> 
        <label for="${Alerts.display[index]}">${Alerts.display[index]} (All)</label><br> 
      </span>
      ${getChildrenIterable(index).map(subIndex => `
        <span style="user-select: none;">
          <input type="checkbox" id="${Alerts.display[subIndex]}" name="alertType" value="${Alerts.display[subIndex]}" checked onclick="updateAlertFilter()">
          <label for="${Alerts.display[subIndex]}">${Alerts.display[subIndex]}</label><br>
        </span>
      `).join('')}
    </div>
  `).join('')
}

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
#controls {
  position: absolute;
  top: 1em;
  left: 1em;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 1em;
  border-radius: 0.5em;
}
</style>
</head>
<body>
<div id="map"></div>
<div id="controls">
  <h3>Select Alert Type</h3>
  <select id="alertTypeSelect" onchange="updateSubtypeVisibility()">
    ${Object.entries(Alerts.types).map(([type, index]) => `
      <option value="${Alerts.display[index]}">${Alerts.display[index]}</option>
    `).join('')}
  </select>
  <div id="subtype-filters">
    ${displayFiltersHTML()}
  </div>
</div>

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
  });

  // Alert colors (generated by the server)
  const alertColours = ${JSON.stringify(alertColours)};

  // Fetch GeoJSON data and store it globally
  let alertData = null;

  fetch('./geojson.json')
    .then(response => response.json())
    .then(data => {
      alertData = data;
      addMapLayers();
      updateAlertFilter(); 
    });

  // Function to add the map source and layers
  function addMapLayers() {
    // Add a clustered GeoJSON source
    map.addSource('alerts', {
      type: 'geojson',
      data: {
        "type": "FeatureCollection",
        "features": [] // Initially empty, will be populated by filterAlertsByBounds
      },
      cluster: true, // Enable clustering
      clusterMaxZoom: 15, // Max zoom to cluster points on
      clusterMinPoints: 20, // Minimum points to cluster
      clusterRadius: 40 // Radius of each cluster when clustering points (defaults to 50)
    });

    // Add a circle layer for clusters
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'alerts',
      filter: ['has', 'point_count'],
      paint: {
        // Use step expressions to make the circle bigger as the cluster size increases
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'point_count'],
          20, '#e6cc00',
          100, '#c61a09'
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          20,
          20,
          25,
          100,
          30
        ]
      }
    });

    // Add a symbol layer for cluster counts
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'alerts',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12
      }
    });

    // Add a circle layer for individual alerts
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'alerts',
      filter: ['!', ['has', 'point_count']],
      minzoom: 7,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 1, 16, 5],
        'circle-color': [
          'match',
          ['get', 'type'],
          ...Object.entries(alertColours).flatMap(([type, color]) => [parseInt(type), color]),
          'gray' // Default color
        ],
        'circle-stroke-color': 'white',
        'circle-stroke-width': 1,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1]
      }
    }, 'waterway-label');

    // Inspect a cluster on click
    map.on('click', 'clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['clusters']
      });
      const clusterId = features[0].properties.cluster_id;
      const source = map.getSource('alerts');

      source.getClusterExpansionZoom(
        clusterId,
        (err, zoom) => {
          if (err) return;

          map.easeTo({
            center: features[0].geometry.coordinates,
            zoom: zoom
          });
        }
      );
    });
  }

  // Event listener for checkbox changes
  const checkboxes = document.querySelectorAll('input[name="alertType"]');
  let isMouseDown = false;
  let isFirstChecked = false;
  let hasChecked = false;

  document.addEventListener('mousedown', () => {
    isMouseDown = true;
  });

  document.addEventListener('mouseup', () => {
    isMouseDown = false;
    hasChecked = false;
  });

  checkboxes.forEach(checkbox => {
    const checkboxContainer = checkbox.parentElement;
    checkboxContainer.addEventListener('mouseover', () => {
      if (isMouseDown) {
        if (!hasChecked) {
          isFirstChecked = checkbox.checked;
          hasChecked = true;
        }

        if (checkbox.checked === isFirstChecked) {
          checkbox.checked = !isFirstChecked
        }

        updateAlertFilter();
      }
    });
  });

  // Function to update the filter based on selected checkboxes
  function updateAlertFilter() {
    const selectedTypes = [];
    checkboxes.forEach(checkbox => {
      if (checkbox.checked) {
        selectedTypes.push(checkbox.value);
      }
    });

    filterAlertsByBounds(selectedTypes);
  }

  // Function to filter alerts by bounds and selected types
  function filterAlertsByBounds(selectedTypes) {
    if (!alertData || !map.getSource('alerts')) {
      return; 
    }

    const visibleFeatures = alertData.features.filter(feature => {
      return selectedTypes.includes(feature.properties.display) ||
             selectedTypes.includes(feature.properties.parentType); // Include if parent type is selected
    });

    // Update the map source with filtered data
    map.getSource('alerts').setData({
      "type": "FeatureCollection",
      "features": visibleFeatures
    });
  }

  // Function to toggle subtype visibility based on selected parent type
  function updateSubtypeVisibility() {
    const selectedType = document.getElementById('alertTypeSelect').value;

    // Hide all subtype containers
    const subtypeContainers = document.querySelectorAll('div[id$="-container"]');
    subtypeContainers.forEach(container => {
      container.style.display = 'none';
    });

    // Show the selected subtype container
    const selectedContainer = document.getElementById(selectedType + '-container');
    if (selectedContainer) {
      selectedContainer.style.display = 'block';
    }

    // Update the filter to reflect the change in visible subtypes
    updateAlertFilter();
  }
</script>
</body>
</html>
`;

// Save HTML content to a file
fs.writeFileSync(`${Config["SOURCE_PATH"]}/index.html`, htmlContent);

// Log success message
console.log('Static HTML file generated successfully!');