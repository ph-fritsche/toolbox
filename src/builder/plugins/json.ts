import fs from 'fs/promises'
import { Plugin } from 'rollup'

const Json = Symbol('json')

declare module 'rollup' {
    export interface CustomPluginOptions {
        [Json]?: Buffer
    }
}

export function createJsonPlugin(
    name = 'json',
): Plugin {
    return {
        name,
        load(id) {
            if (id.endsWith('.json')) {
                return fs.readFile(id).then(
                    b => {
                        this.getModuleInfo(id).meta[Json] = b

                        return `export default ${String(b)}`
                    },
                    () => undefined,
                )
            }
        },
        renderChunk(code, chunk) {
            if (chunk.fileName.endsWith('.json.js')) {
                const info = this.getModuleInfo(chunk.facadeModuleId)
                if (info.meta[Json]) {
                    this.emitFile({
                        type: 'asset',
                        fileName: chunk.fileName.substring(0, chunk.fileName.length - 3),
                        source: info.meta[Json],
                    })
                }
            }
            return null
        }
    }
}
