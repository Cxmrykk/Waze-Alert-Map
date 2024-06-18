require('@dotenvx/dotenvx').config({
    logLevel: "error"
})

function UseDefault(key) {
    console.warn(`WARNING: Environment variable '${key}' not found, using default`)
    return Defaults[key]
}

function RequireDefault(key) {
    console.error(`ERROR: Environment variable '${key}' must be defined before the program can continue.`)
    process.exit(1)
}

function ParseFloat(value) {
    if (parseFloat(value) === NaN) {
        console.error(`ERROR: Invalid float value in .env configuration (Expected float, found something else)`)
        process.exit(1)
    }

    return parseFloat(value)
}

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
    "QUERY_COOLDOWN": 600,
    "QUERY_DELAY": 0,
    "ACCESS_TOKEN": "your_access_token_here",
    "SOURCE_PATH": "./cache"
}

const Config = {
    "DB_PATH": () => process.env.DB_PATH || UseDefault("DB_PATH"),
    "MAX_ALERTS": () => process.env.MAX_ALERTS || UseDefault("MAX_ALERTS"),
    "AREA_TOP": () => ParseFloat(process.env.AREA_TOP || UseDefault("AREA_TOP")),
    "AREA_BOTTOM": () => ParseFloat(process.env.AREA_BOTTOM || UseDefault("AREA_BOTTOM")),
    "AREA_LEFT": () => ParseFloat(process.env.AREA_LEFT || UseDefault("AREA_LEFT")),
    "AREA_RIGHT": () => ParseFloat(process.env.AREA_RIGHT || UseDefault("AREA_RIGHT")),
    "QUERY_COOLDOWN": () => process.env.QUERY_COOLDOWN || UseDefault("QUERY_COOLDOWN"),
    "QUERY_DELAY": () => process.env.QUERY_DELAY || UseDefault("QUERY_DELAY"),
    "ACCESS_TOKEN": () => process.env.ACCESS_TOKEN || RequireDefault("ACCESS_TOKEN"),
    "SOURCE_PATH": () => process.env.SOURCE_PATH || UseDefault("SOURCE_PATH")
}

function Inject(...variables) {
    const Variables = {}

    for (const key of variables) {
        Variables[key] = Config[key]()
    }

    return Variables
}

module.exports = Inject