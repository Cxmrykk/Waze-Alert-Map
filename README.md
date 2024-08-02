### Setup
```sh
# Clone the repository using git
git clone https://github.com/Cxmrykk/Waze-Alert-Map.git
cd Waze-Alert-Map
```
```sh
# Install node dependencies using NPM
npm install
```
```sh
# Create the .env configuration file from the template
# Note: you must set your ACCESS_TOKEN
# Your access token can be found here: https://account.mapbox.com/
cp .env.template .env
nano .env
```
```sh
# Running the database server (must run at least once)
# Leave this running to collect alerts over time
node index.js

# Generating the HTML/JSON template files
node generate-template.js
```
### How to use the web interface
- The HTML files are generated in the `./cache` directory by default
- Simply use any HTTP server (examples are listed below)
  - [http-server](https://www.npmjs.com/package/http-server)
  - [static-web-server](https://github.com/static-web-server/static-web-server)
