import { Plugin } from "rollup";

const PREFIX = '\0undefined?'
export function createUndefinedPlugin(): Plugin {
    return {
        name: 'undefined-module',
        resolveId(source, importer) {
            if (!importer) {
                return
            }
            console.warn(`Replacing missing module "${source}" imported by "${importer}" with undefined.`)
            return `${PREFIX}${source}`
        },
        load(id) {
            if (id.startsWith(PREFIX)) {
                return 'export default undefined\nexport {}\n'
            }
        },
    }
}
