const Config = require("./helper/export-env")(
    "DB_PATH",
    "MAX_ALERTS",
    "AREA_TOP",
    "AREA_BOTTOM",
    "AREA_LEFT",
    "AREA_RIGHT",
    "QUERY_COOLDOWN",
    "QUERY_DELAY",
)

const Alerts = require("./alert-types.json")
const Database = require('better-sqlite3')
const axios = require("axios")

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
      type INTEGER,
      pubMillis INTEGER,
      latitude REAL,
      longitude REAL
    )
`)

/*
    Logger helper functions
*/

function getFormattedDate() {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
  
    return `[${day}/${month}/${year} - ${hours}:${minutes}:${seconds}]`
}

function println(string) {
    console.info(`${getFormattedDate()} ${string}`)
}

/*
    Send HTTP get request to Waze LiveMap API
*/
async function getData(top, bottom, left, right) {
    const response = await axios.get(`https://www.waze.com/live-map/api/georss?top=${top}&bottom=${bottom}&left=${left}&right=${right}&env=row&types=alerts`)
        .catch(reason => {
            console.error(`ERROR: Axios get request failed with reason '${reason}'`)
            return null
        })

    if (response === null) {
        return null
    }

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
            alert.subtype === "" ? Alerts["types"][alert.type] : Alerts["subtypes"][alert.subtype],
            alert.pubMillis,
            alert.location.y,
            alert.location.x
        )
    }
}

function estimateArea(top, bottom, left, right) {  
    // Earth's radius in kilometers
    const earthRadiusKm = 6371

    // Convert latitude and longitude from degrees to radians
    const topRad = (Math.PI / 180) * top
    const bottomRad = (Math.PI / 180) * bottom
    const leftRad = (Math.PI / 180) * left
    const rightRad = (Math.PI / 180) * right

    // Calculate the height and width of the area in radians
    const height = Math.abs(topRad - bottomRad)
    const width = Math.abs(rightRad - leftRad)

    // Calculate the area using the spherical law of cosines
    const area = (earthRadiusKm ** 2) * height * width

    return area
}

/*
    Infinite loop; main thread
*/
async function main() {
    let before = 0
    let after = 0

    while (true) {
        let counter = 0
        before = new Date().getTime()

        queue.push(
            {
                top: Config["AREA_TOP"],
                bottom: Config["AREA_BOTTOM"],
                left: Config["AREA_LEFT"],
                right: Config["AREA_RIGHT"]
            }
        )

        while (queue.length > 0) {
            counter++

            const { top, bottom, left, right } = queue.pop()
            const data = await getData(top, bottom, left, right)

            if (data === null) {
                println(`Skipping Queue #${queue.length} (request error)`)
                continue
            }

            println(`Iteration #${counter} - Processing Queue #${queue.length} (Area estimate: ${Math.round(estimateArea(top, bottom, left, right))} km)`)

            // Error object found
            if (data.error !== undefined) {
                console.error(`ERROR: Waze LiveMap API Error: '${data.error}'`)
                continue
            }

            // No alerts object defined (empty response)
            if (data.alerts === undefined) {
                println("No 'alerts' key in json data response (empty response)")
                continue
            }

            // Too many alerts displayed at once
            if (data.alerts.length >= Config["MAX_ALERTS"]) {
                println(`Maximum alerts reached, adding split chunks to queue.`)
                queue.push(...splitData(top, bottom, left, right))
            } else {
                println(`Found ${data.alerts.length} alerts.`)
                useData(data)
            }

            // delay the next query
            if (Config["QUERY_DELAY"] > 0) {
                await new Promise(resolve => setTimeout(resolve, Config["QUERY_DELAY"]))
            }
        }

        // wait for the rest of the cooldown
        after = new Date().getTime()

        let cooldown = (Config["QUERY_COOLDOWN"] * 1000) - (after - before)
        
        if (cooldown > 0) {
            println(`Finished sending requests. Waiting for ${Math.round(cooldown / 1000)} seconds before sending the next request`)
            await new Promise(resolve => setTimeout(resolve, cooldown))
        } else {
            println("Finished sending requests, immediately resuming operation (cooldown has already passed).")
        }
    }
}

main()