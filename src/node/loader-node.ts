/*
 * Resolve node built-ins
 */

import module from 'node:module'

export const resolve: NodeJSLoader.Resolver = async (specifier, context, nextResolve) => {
    const id = specifier.startsWith('node:') ? specifier.substring(5) : specifier
    if (module.builtinModules.includes(id)) {
        return {
            shortCircuit: true,
            format: 'builtin',
            url: 'node:' + id,
        }
    }

    return nextResolve(specifier, context)
}
