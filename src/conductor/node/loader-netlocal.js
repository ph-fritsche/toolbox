/*
* Support import of local files and dependencies in modules served on localhost.
*/

import process from 'node:process'

/**
 * @type {NodeJSLoader.Resolver}
 */
export const resolve = async (specifier, context, nextResolve) => {
    if (context.parentURL?.startsWith('http://127.0.0.1:')) {
        if (specifier.startsWith('file:///')) {
            return {
                shortCircuit: true,
                url: specifier,
            }
        } else if (!specifier.includes(':') && /^[\w@]/.test(specifier)) {
            return nextResolve(specifier, {
                conditions: [],
                importAssertions: {},
                parentURL: 'file://' + process.cwd() + '/#cli',
            })
        }
    }

    return nextResolve(specifier, context)
}
