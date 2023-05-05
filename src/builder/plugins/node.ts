import { Plugin, PreRenderedChunk } from 'rollup'
import { isBuiltin } from 'node:module'

const __filename = import.meta.url.substring(5)

const nodeCorePrefix = '\0node?'

export function createNodeCorePaths(
    prefix = '/__node-',
    suffix = '.js',
) {
    return (id: string) => {
        if (isBuiltin(id)) {
            return prefix + getCoreModuleName(id).replaceAll('/', '-') + suffix
        }
    }
}

export function createNodeCoreEntryFileNames(
    prefix = '__node-',
    suffix = '.js',
    fallback = '[name].js',
) {
    return (chunkInfo: PreRenderedChunk) => {
        if (chunkInfo.facadeModuleId?.startsWith(nodeCorePrefix)) {
            return prefix + chunkInfo.facadeModuleId.substring(nodeCorePrefix.length).replaceAll('/', '-') + suffix
        }
        return fallback
    }
}

function getCoreModuleName(id: string) {
    return id.startsWith('node:') ? id.substring(5) : id
}

export type NodePolyfillPluginOptions = object

export function createNodePolyfillPlugin(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options: NodePolyfillPluginOptions = {},
    name = 'node-core-polyfill',
): Plugin {
    return {
        name,

        resolveId(source, importer) {
            if (isBuiltin(source)) {
                const moduleName = source.startsWith('node:') ? source.substring(5) : source

                if (importer?.startsWith(nodeCorePrefix)) {
                    return false
                }

                return nodeCorePrefix + moduleName
            }
        },
        async load(id) {
            if (id.startsWith(nodeCorePrefix)) {
                const moduleName = id.substring(nodeCorePrefix.length)

                const geutPolyfill = await this.resolve(`@geut/browser-node-core/${moduleName}`, __filename)
                if (!geutPolyfill) {
                    console.warn(`Module "${moduleName}" is not provided by "@geut/browser-node-core".`)
                    return `export default {}\nexport {}\n`
                }

                return `export {default} from "${geutPolyfill.id}"\nexport * from "${geutPolyfill.id}"\n`
            }
        },
    }
}

export type NodeReexportPluginOptions = object

export function createNodeReexportPlugin(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options: NodeReexportPluginOptions = {},
    name = 'node-core-reexport',
): Plugin {
    return {
        name,

        resolveId(source, importer) {
            if (isBuiltin(source)) {
                const moduleName = source.startsWith('node:') ? source.substring(5) : source

                if (importer?.startsWith(nodeCorePrefix)) {
                    return false
                }

                return nodeCorePrefix + moduleName
            }
        },
        load(id) {
            if (id.startsWith(nodeCorePrefix)) {
                const moduleName = id.substring(nodeCorePrefix.length)
                return `export {default} from "${moduleName}"\nexport * from "${moduleName}"\n`
            }
        },
    }
}
