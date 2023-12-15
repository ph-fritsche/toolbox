/// <reference types="node" />
import * as TS from "typescript";
import fs from "fs";
import { MaybeArray, PartialExcept } from "helpertypes";
type ReadonlyFileSystem = Pick<typeof fs, "statSync" | "lstatSync" | "readFileSync" | "readdirSync">;
type FileSystem = ReadonlyFileSystem & Pick<typeof fs, "writeFileSync" | "mkdirSync">;
declare const enum LogLevelKind {
    NONE = 0,
    INFO = 1,
    VERBOSE = 2,
    DEBUG = 3
}
interface Loggable {
    /**
     * The current log level
     */
    readonly logLevel: LogLevelKind;
    /**
     * Logs info-related messages
     */
    info(...messages: unknown[]): void;
    /**
     * Logs verbose-related messages
     */
    verbose(...messages: unknown[]): void;
    /**
     * Logs debug-related messages
     */
    debug(...messages: unknown[]): void;
    /**
     * Logs warning-related messages
     */
    warn(...messages: unknown[]): void;
}
interface TaskOptions {
    /**
     * A logger that can print messages of varying severity depending on the log level
     */
    logger: Loggable;
    /**
     * The FileSystem to use. Useful if you want to work with a virtual file system. Defaults to using the "fs" module
     */
    fileSystem: ReadonlyFileSystem;
    /**
     * The base directory (defaults to process.cwd())
     */
    cwd: string;
    /**
     * Determines how module specifiers are treated.
     * - external (default): CommonJS module specifiers identifying libraries or built-in modules are preserved (default)
     * - internal: CommonJS module specifiers identifying anything else than libraries or built-in modules are preserved
     * - always: CommonJS module specifiers are never transformed.
     * - never: CommonJS module specifiers are always transformed
     * It can also take a function that is invoked with a module specifier and returns a boolean determining whether or not it should be preserved
     */
    preserveModuleSpecifiers: "always" | "never" | "external" | "internal" | ((specifier: string) => boolean);
    /**
     * Determines whether or not to include import assertions when converting require() calls referencing JSON files to ESM.
     * - true (default): Import assertions will always be added when relevant.
     * - false: Import assertions will never be added.
     * It can also take a function that is invoked with a module specifier and returns a boolean determining whether or not an import assertion should be added
     */
    importAssertions: boolean | ((specifier: string) => boolean);
    /**
     * If given, a specific TypeScript version to use
     */
    typescript: typeof TS;
    /**
     * If true, debug information will be printed. If a function is provided, it will be invoked for each file name. Returning true from the function
     * determines that debug information will be printed related to that file
     */
    debug: boolean | string | ((file: string) => boolean);
}
interface CjsToEsmOptions extends TaskOptions {
}
/**
 * CustomTransformer that converts CommonJS to tree-shakeable ESM
 */
declare function cjsToEsm(options?: Partial<CjsToEsmOptions>): TS.CustomTransformers;
declare function cjsToEsmTransformer(options?: Partial<CjsToEsmOptions>): TS.TransformerFactory<TS.SourceFile>;
interface TransformHooks {
    /**
     * If a string is returned from this hoo, that text will be written to disk instead
     */
    writeFile(file: string, text: string): string | void;
}
interface TransformTaskOptions extends TaskOptions {
    /**
     * The input glob(s) to match against the file system
     */
    input: MaybeArray<string>;
    /**
     * Optionally, the output directory to use. Defaults to inheriting that of the matched input files`
     */
    outDir?: string;
    /**
     * If write is false, no files will be written to disk
     */
    write: boolean;
    /**
     * The FileSystem to use. Useful if you want to work with a virtual file system. Defaults to using the "fs" module
     */
    fileSystem: FileSystem;
    /**
     * A collection of hooks into the transformation process
     * that can be used for logging or altering the internal behavior
     */
    hooks: Partial<TransformHooks>;
}
interface TransformedFile {
    fileName: string;
    text: string;
}
interface TransformResult {
    files: TransformedFile[];
}
declare function transform(options: PartialExcept<TransformTaskOptions, "input" | "outDir">): Promise<TransformResult>;
export { cjsToEsm, CjsToEsmOptions, cjsToEsmTransformer, transform, TransformHooks, TransformTaskOptions, TransformedFile, TransformResult };
//# sourceMappingURL=index.d.ts.map