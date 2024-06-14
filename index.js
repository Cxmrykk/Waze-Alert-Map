
require('@dotenvx/dotenvx').config({
    logLevel: "error"
})

const Database = require('better-sqlite3')
const axios = require("axios")

/*
    Default .env values and warning handler
*/
const Defaults = {
    "DB_PATH": "./cache/database.db",
    "MAX_ALERTS": 200,
    "AREA_TOP": "-10.683",
    "AREA_BOTTOM": "-43.633",
    "AREA_LEFT": "113.15",
    "AREA_RIGHT": "153.633",
}

function UseDefault(key) {
    console.warn(`Environment variable '${key}' not found, using default`)
    return Defaults[key]
}

function ParseFloat(value) {
    if (parseFloat(value) === NaN) {
        console.error(`ERROR: Invalid float value in .env configuration (Expected float, found something else)`)
        process.exit(1)
    }

    return parseFloat(value)
}

const Config = {
    "DB_PATH": process.env.DB_PATH || UseDefault["DB_PATH"],
    "MAX_ALERTS": process.env.MAX_ALERTS || UseDefault["MAX_ALERTS"],
    "AREA_TOP": ParseFloat(process.env.AREA_TOP || UseDefault["AREA_TOP"]),
    "AREA_BOTTOM": ParseFloat(process.env.AREA_BOTTOM || UseDefault["AREA_BOTTOM"]),
    "AREA_LEFT": ParseFloat(process.env.AREA_LEFT || UseDefault["AREA_LEFT"]),
    "AREA_RIGHT": ParseFloat(process.env.AREA_RIGHT || UseDefault["AREA_RIGHT"]),
}

function Area(top, bottom, left, right) {
    this.top = top,
    this.bottom = bottom,
    this.left = left,
    this.right = right
}

/*
    Read database
*/
const db = new Database(Config["DB_PATH"])
const queue = []

db.pragma('journal_mode = WAL')
db.exec(`
    CREATE TABLE IF NOT EXISTS data (
      uuid TEXT PRIMARY KEY,
      type TEXT,
      pubMillis INTEGER,
      latitude REAL,
      longitude REAL
    )
`)

/*
    Send HTTP get request to Waze LiveMap API
*/
async function getData(top, bottom, left, right) {
    const response = await axios.get(`https://www.waze.com/live-map/api/georss?top=${top}&bottom=${bottom}&left=${left}&right=${right}&env=row&types=alerts`)
    return response.data
}

/*
    Split an area into quarter chunks
*/
function splitData(top, bottom, left, right) {
    // split the area into quarters
    const midVertical = left + (right - left) / 2
    const midHorizontal = top + (bottom - top) / 2
    return [
        new Area(top, midHorizontal, left, midVertical), // top left
        new Area(top, midHorizontal, midVertical, right), // top right
        new Area(midHorizontal, bottom, left, midVertical), // bottom left
        new Area(midHorizontal, bottom, midVertical, right), // bottom right
    ]
}

/*
    Format the data and send it to the database
*/
function useData(data) {
    for (const alert of data.alerts) {
        // Prepare the insert statement
        const insert = db.prepare(`
            INSERT OR IGNORE INTO data (uuid, type, pubMillis, latitude, longitude)
            VALUES (?, ?, ?, ?, ?)
        `)
        
        // Insert the data into the table
        insert.run(
            alert.uuid,
            alert.type,
            alert.pubMillis,
            alert.location.y,
            alert.location.x
        )
    }
}

/*
    Infinite loop; main thread
*/
async function main() {
    while (queue.length > 0) {
        const { top, bottom, left, right } = queue.pop()
        const data = await getData(top, bottom, left, right)

        console.info(`Queue length: ${queue.length}. Data retrieved for latitude ${top} - ${bottom}, longitude ${left} - ${right}`)

        // Error object found
        if (data.error !== undefined) {
            console.warn(`Waze LiveMap API Error: '${data.error}'`)
            continue
        }

        // No alerts object defined
        if (data.alerts === undefined) {
            console.warn("No 'alerts' key in json data response")
            continue
        }

        // Too many alerts displayed at once
        if (data.alerts.length >= Config["MAX_ALERTS"]) {
            queue.push(...splitData(top, bottom, left, right))
        } else {
            useData(data)
        }
    }
}

/*
    Start the program with default area
*/
queue.push(
    {
        top: Config["AREA_TOP"],
        bottom: Config["AREA_BOTTOM"],
        left: Config["AREA_LEFT"],
        right: Config["AREA_RIGHT"]
    }
)

main()