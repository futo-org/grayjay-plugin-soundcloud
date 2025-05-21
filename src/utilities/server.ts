import { createServer } from "node:http"
import { networkInterfaces } from "node:os"
import { readFile } from "node:fs/promises"

const PORT = 8080

// Define a map of files to serve
const files = {
    "/src/SoundcloudScript.js": {
        content: await readFile("SoundcloudScript.js"),
        type: "application/javascript",
    },
    "/src/script.ts": {
        content: await readFile("script.ts"),
        type: "application/x-typescript",
    },
    "/src/script.js.map": {
        content: await readFile("script.js.map"),
        type: "application/json",
    },
    "/src/config.json": {
        content: await readFile("SoundcloudConfig.json"),
        type: "application/json",
    },
    "/src/soundcloud.png": {
        content: await readFile("soundcloud.png"),
        type: "image/png",
    },
} as const

function getLocalIPAddress(): string {
    const br = networkInterfaces()
    const network_devices = Object.values(br)
    for (const network_interface of network_devices) {
        if (network_interface === undefined) {
            continue
        }
        for (const { address, family } of network_interface) {
            if (family === "IPv4" && address !== "127.0.0.1") {
                return address
            }
        }
    }
    throw new Error("panic")
}

createServer((req, res) => {
    const file = (() => {
        switch (req.url) {
            case "/src/SoundcloudScript.js":
                return files[req.url]
            case "/src/script.ts":
                return files[req.url]
            case "/src/script.js.map":
                return files[req.url]
            case "/src/config.json":
                return files[req.url]
            case "/src/soundcloud.png":
                return files[req.url]
            default:
                return undefined
        }
    })()

    if (file !== undefined) {
        res.writeHead(200, { "Content-Type": file.type })
        res.end(file.content)
        return
    }

    res.writeHead(404)
    res.end("File not found")
    return
}).listen(PORT, () => {
    console.log(`Server running at http://${getLocalIPAddress()}:${PORT.toString()}/src/config.json`)
})
