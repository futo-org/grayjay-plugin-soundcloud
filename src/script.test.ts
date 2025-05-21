//#region imports
import { describe, test } from "node:test"
import assert from "node:assert"
// initializes global state
import "@kaidelorenzo/grayjay-polyfill"

import { extract_track_id } from "./script.js"
//#endregion

await Promise.allSettled([describe("script module unit", { skip: false }, () => {
    return test("test extract track id", { skip: false }, () => {
        if (source.enable === undefined) {
            throw new Error("source needs to be initialized")
        }
        source.enable({ id: "mock id" }, {})

        const song_url = "https://soundcloud.com/prettylightslive/cant-contain-it-1"
        const track_id = extract_track_id(song_url)
        assert.strictEqual(track_id, 2002322991)
    })
})])
