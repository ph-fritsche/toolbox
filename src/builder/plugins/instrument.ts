import { Plugin } from "rollup"
import {createInstrumenter} from 'istanbul-lib-instrument'

export function createIstanbulPlugin(): Plugin {
    return {
        name: 'istanbul',
        async transform(code, id) {
            if (id.includes('/node_modules/') || !/\.[jt]sx?$/.test(id)) {
                return
            }
            const {mappings, names, sources, sourcesContent, version} = this.getCombinedSourcemap()

            const instrumenter = createInstrumenter({
                esModules: true,
                produceSourceMap: true,
            })
            const instrumentedCode = instrumenter.instrumentSync(code, id, {
                mappings,
                names,
                sources,
                sourcesContent,
                version: String(version),
            })
            const sourceMap = instrumenter.lastSourceMap()
            
            return {
                code: instrumentedCode,

                map: {
                    mappings: sourceMap.mappings,
                    names: sourceMap.names,
                    sources: sourceMap.sources,
                    sourcesContent: sourceMap.sourcesContent,
                    version: Number(sourceMap.version),
                },
            }
        }
    }
}
