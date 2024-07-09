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

function displayAlertTypes() {
  // Get the first alert type by default
  const defaultType = Alerts.display[Object.values(Alerts.types)[0]];
  return Object.entries(Alerts.types).map(([type, index]) => `
    <option value="${Alerts.display[index]}" ${Alerts.display[index] === defaultType ? 'selected' : ''}>${Alerts.display[index]}</option>
  `).join('')
}

function displayFiltersHTML() {
  // Get the first alert type by default
  const defaultType = Alerts.display[Object.values(Alerts.types)[0]];
  return Object.entries(Alerts.types).map(([type, index]) => `
    <div id="${Alerts.display[index]}-container" style="display: ${Alerts.display[index] === defaultType ? 'block' : 'none'}">
      <h3>${Alerts.display[index]}</h3>
      <span style="user-select: none;">
        <input type="checkbox" id="${Alerts.display[index]}" name="alertType" value="${Alerts.display[index]}" onclick="updateAlertFilter()"> 
        <label for="${Alerts.display[index]}">${Alerts.display[index]} (All)</label><br> 
      </span>
      ${getChildrenIterable(index).map(subIndex => `
        <span style="user-select: none;">
          <input type="checkbox" id="${Alerts.display[subIndex]}" name="alertType" value="${Alerts.display[subIndex]}" onclick="updateAlertFilter()">
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
#configuration {
  position: absolute;
  top: 1em;
  right: 1em;
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
    ${displayAlertTypes()}
  </select>
  <div id="subtype-filters">
    ${displayFiltersHTML()}
  </div>
</div>

<div id="configuration">
  <h3>Configure Map</h3>
  <label for="clusterRadiusSlider">Cluster Radius: <span id="clusterRadiusValue">50</span></label><br>
  <input id="clusterRadiusSlider" type="range" min="1" max="100" value="50" oninput="updateClusterRadius(this.value)"><br>

  <label for="clusterMaxZoomSlider">Cluster Max Zoom: <span id="clusterMaxZoomValue">15</span></label><br>
  <input id="clusterMaxZoomSlider" type="range" min="0" max="24" value="15" oninput="updateClusterMaxZoom(this.value)"><br>

  <label for="clusterMinPointsSlider">Cluster Min Points: <span id="clusterMinPointsValue">20</span></label><br>
  <input id="clusterMinPointsSlider" type="range" min="1" max="100" value="20" oninput="updateClusterMinPoints(this.value)"><br>
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

  let clusterRadius = 50;
  let clusterMaxZoom = 15;
  let clusterMinPoints = 20;

  // Function to add the map source and layers
  function addMapLayers() {
    // Remove the existing source and layers if they exist
    if (map.getSource('alerts')) {
      map.removeLayer('clusters');
      map.removeLayer('cluster-count');
      map.removeLayer('unclustered-point');
      map.removeSource('alerts');
    }

    // Add a clustered GeoJSON source
    map.addSource('alerts', {
      type: 'geojson',
      data: {
        "type": "FeatureCollection",
        "features": [] // Initially empty, will be populated by filterAlertsByBounds
      },
      cluster: true, // Enable clustering
      clusterMaxZoom: clusterMaxZoom, // Max zoom to cluster points on
      clusterMinPoints: clusterMinPoints, // Minimum points to cluster
      clusterRadius: clusterRadius // Radius of each cluster when clustering points (defaults to 50)
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

  // Get all subtype containers
  const subtypeContainers = document.querySelectorAll('div[id$="-container"]');

  // Iterate over each subtype container
  subtypeContainers.forEach(container => {
    // Get the parent type from the container ID
    const containerType = container.id.replace('-container', '');

    // Get all checkboxes within the container
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    if (containerType === selectedType) {
      // If the container matches the selected type, show it and enable checkboxes
      container.style.display = 'block';
      checkboxes.forEach(checkbox => {
        checkbox.disabled = false;
      });
    } else {
      // Otherwise, hide the container and disable checkboxes
      container.style.display = 'none';
      checkboxes.forEach(checkbox => {
        checkbox.disabled = true;
        checkbox.checked = false; // Uncheck the boxes when hidden
      });
    }
  });

  // Update the filter to reflect the change in visible subtypes
  updateAlertFilter();
}

// Call updateSubtypeVisibility on page load to show the default type's checkboxes
window.onload = function() {
  updateSubtypeVisibility();
};

function updateClusterRadius(value) {
  document.getElementById('clusterRadiusValue').textContent = value;
  clusterRadius = parseInt(value);
  addMapLayers(); // Re-add layers to apply changes
  updateAlertFilter(); // Re-apply filters
}

function updateClusterMaxZoom(value) {
  document.getElementById('clusterMaxZoomValue').textContent = value;
  clusterMaxZoom = parseInt(value);
  addMapLayers(); // Re-add layers to apply changes
  updateAlertFilter(); // Re-apply filters
}

function updateClusterMinPoints(value) {
  document.getElementById('clusterMinPointsValue').textContent = value;
  clusterMinPoints = parseInt(value);
  addMapLayers(); // Re-add layers to apply changes
  updateAlertFilter(); // Re-apply filters
}
  
</script>
</body>
</html>
`;

// Save HTML content to a file
fs.writeFileSync(`${Config["SOURCE_PATH"]}/index.html`, htmlContent);

// Log success message
console.log('Static HTML file generated successfully!');