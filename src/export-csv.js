const Config = require("../helper/export-env")("DB_PATH", "SOURCE_PATH");
const Database = require('better-sqlite3');
const fs = require('fs');
const { stringify } = require('csv-stringify');
const cliProgress = require('cli-progress');

// Read database
const db = new Database(Config["DB_PATH"], { readonly: true });

// Get total number of rows for progress bar
const totalRows = db.prepare('SELECT COUNT(*) FROM data').get()['COUNT(*)'];

// Create a new progress bar
const progressBar = new cliProgress.SingleBar({
    format: 'CSV Export Progress | {bar} | {percentage}% | {value}/{total} | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
}, cliProgress.Presets.shades_classic);

progressBar.start(totalRows, 0);


// Stream data from the database and write to CSV in chunks
const stream = db.prepare('SELECT * FROM data').iterate();
const stringifier = stringify({ header: true, columns: ['uuid', 'type', 'pubMillis', 'latitude', 'longitude', 'start_time'] });
const writeStream = fs.createWriteStream(Config["SOURCE_PATH"] + '/waze_alerts.csv');

stringifier.pipe(writeStream);

let rowsProcessed = 0;
for (const row of stream) {
    const date = new Date(row.pubMillis);
    const isoString = date.toISOString();
    stringifier.write({ ...row, start_time: isoString });
    rowsProcessed++;
    progressBar.update(rowsProcessed);
}


stringifier.end();

// Close the database connection when finished
db.close();


writeStream.on('finish', () => {
    progressBar.stop();
    console.log('\nCSV file successfully created:\n' + Config["SOURCE_PATH"] + '/waze_alerts.csv');

});

writeStream.on('error', err => {
    progressBar.stop();
    console.error("Error writing CSV to file:", err);
});