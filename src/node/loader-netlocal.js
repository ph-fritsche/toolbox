/*
* Support import of local files and dependencies in modules served on localhost.
*/

import module from 'node:module'
import process from 'node:process'
import url from 'node:url'

/**
 * @type NodeJSLoader.Resolver
 */
export const resolve = async (specifier, context, nextResolve) => {
    if (context.parentURL?.startsWith('http://127.0.0.1:')) {
        if (specifier.startsWith('file:///')) {
            return {
                shortCircuit: true,
                url: specifier,
            }
        } else if (/^(node:)?\w[/\w]+$/.test(specifier) && module.isBuiltin(specifier)) {
            return {
                shortCircuit: true,
                format: 'builtin',
                url: specifier,
            }
        } else if (!specifier.includes(':') && /^[\w@]/.test(specifier)) {
            return nextResolve(specifier, {...context,
                parentURL: String(url.pathToFileURL(process.cwd())) + '/#cli',
            })
        }
    }

    return nextResolve(specifier, context)
}
