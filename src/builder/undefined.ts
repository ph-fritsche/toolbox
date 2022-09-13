import { Plugin } from "rollup";

const PREFIX = '\0undefined?'
export function createUndefinedPlugin(): Plugin {
    return {
        name: 'undefined-module',
        resolveId(source, importer) {
            if (!importer) {
                return
            }
            return `${PREFIX}${source}`
        },
        load(id) {
            if (id.startsWith(PREFIX)) {
                return 'export default undefined'
            }
        },
    }
}
