import { Plugin } from 'rollup'
import fs from 'fs/promises'
// @ts-ignore -- missing in @types/node
import { isBuiltin } from 'module'

const __filename = import.meta.url.substring(5)

export type NodeCorePluginOptions = {
    additionalPolyfills?: (moduleName: string) => string|undefined,
    externalPolyfills?: (moduleName: string) => string|undefined,
    overridePolyfills?: (moduleName: string) => string|undefined,
}

export function createNodeCorePlugin(
    {
        additionalPolyfills,
        externalPolyfills,
        overridePolyfills,
    }: NodeCorePluginOptions,
    name = 'node-core-polyfill',
): Plugin {
    return {
        name,

        async resolveId(source, importer, options) {
            if (isBuiltin(source)) {
                const moduleName = source.startsWith('node:') ? source.substring(5) : source

                const overridePolyfill = overridePolyfills?.(moduleName)
                if (overridePolyfill) {
                    if (await fs.lstat(overridePolyfill).then(() => true, () => false)) {
                        return overridePolyfill
                    }
                } else {
                    const geutPolyfill = await this.resolve(`@geut/browser-node-core/${moduleName}`, __filename, {
                        ...options,
                        skipSelf: true,
                        custom: {
                            ...options.custom,
                            undefined: false,
                        },
                    })
                    if (geutPolyfill && !geutPolyfill.id.startsWith('\0')) {
                        return geutPolyfill
                    }
                }

                const additionalPolyfill = additionalPolyfills?.(moduleName)
                if (additionalPolyfill && await fs.lstat(additionalPolyfill).then(() => true, () => false)) {
                    return additionalPolyfill
                }

                const externalPolyfill = externalPolyfills?.(moduleName)
                if (externalPolyfill) {
                    return {
                        external: true,
                        id: externalPolyfill,
                    }
                }

                throw new Error(`Missing polyfill for "${moduleName}" imported by "${importer}".`)
            }
        },
    }
}
