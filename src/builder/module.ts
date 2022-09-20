import { isBuiltin } from "module";

declare module 'module' {
    export function isBuiltin(moduleName: string): boolean
}

export { isBuiltin as isNodeJsBuiltin }
