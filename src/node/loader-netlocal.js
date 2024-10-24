/*
* Support import of local files and dependencies in modules served on localhost.
*/

import module from 'node:module'
import process from 'node:process'
import url from 'node:url'
import { get } from 'node:http'

/**
 * @type NodeJSLoader.Resolver
 */
export const resolve = async (specifier, context, nextResolve) => {
    if (context.parentURL?.startsWith('http://127.0.0.1:')) {
        if (specifier.startsWith('file:///') || specifier.startsWith('http://127.0.0.1:')) {
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

/**
 * @type NodeJSLoader.Loader
 */
export const load = (url, context, nextLoad) => {
    if (url.startsWith('http://127.0.0.1:')) {
        return new Promise((res, rej) => {
            get(url, r => {
                let content = ''
                r.setEncoding('utf8')
                r.on('data', c => content += c)
                r.on('end', () => {
                    res({
                        format: 'module',
                        shortCircuit: true,
                        source: content,
                    })
                })
            }).on('error', rej)
        })
    }

    return nextLoad(url, context)
}
