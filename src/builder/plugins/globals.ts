import { Plugin, GlobalsOption } from 'rollup'
import externalGlobals from 'rollup-plugin-external-globals'

export function createGlobalsPlugin(
    {
        globals = {},
    }: {
        globals?: GlobalsOption
    },
): Plugin {
    return externalGlobals(globals)
}
