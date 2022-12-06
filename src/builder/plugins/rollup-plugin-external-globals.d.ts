declare module 'rollup-plugin-external-globals' {
    import { Plugin, GlobalsOption } from 'rollup'
    export default function createPlugin(option: GlobalsOption): Plugin
}
