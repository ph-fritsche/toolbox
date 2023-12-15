import ts from 'typescript'
import { cjsToEsmTransformer, CjsToEsmOptions } from 'cjstoesm'

/**
 * Transpile module per Typescript compiler and `cjstoesm` transformer.
 *
 * This causes a lot of calls to `fs.lstatSync` and is slow.
 */
export function transpileCjsToEsm(
    code: string,
    fileName: string,
    config: {
        cjsToEsmOptions?: Partial<CjsToEsmOptions>,
        /**
         * Add a default export if the module does not already have one.
         *
         * @default true
         */
        addInterop?: boolean
    } = {},
) {
    const before: ts.CustomTransformers['before'] = []
    before.push(cjsToEsmTransformer({
        preserveModuleSpecifiers: 'always',
        ...config.cjsToEsmOptions,
    }))
    if (config.addInterop !== false) {
        before.push(addInteropTransformer)
    }

    const result = ts.transpileModule(code, {
        transformers: {
            before,
        },
        fileName,
        moduleName: fileName,
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            sourceMap: true,
        },
    })

    return {
        code: result.outputText.replace(/\/\/# sourceMappingURL=.*$/, ''),
        map: result.sourceMapText as string,
    }
}

// One can require a CommonJS module that doesn't declare any exports.
// Importing a missing default export in EcmaScript is invalid.
// The transpiler would need to check the structure of the imported file
// and remove the import or convert it to a side-effect import.
// As side-effect importing a module that does declare a default export is valid EcmaScript,
// the transpiler does not parse the imported modules
// but moves the burden of compatibility to the imported module.

/**
 * Add a default export if the module does not already have one.
 */
const addInteropTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => (sourceFile) => {
    let hasDefaultExport = false
    const namedExports = new Map<string, string|undefined>()

    for (const stmt of sourceFile.statements) {
        if (ts.isExportAssignment(stmt)) {
            hasDefaultExport = true
        } else if (ts.isExportDeclaration(stmt)
            && stmt.exportClause
            && 'elements' in stmt.exportClause
        ) {
            for (const spec of stmt.exportClause.elements) {
                const name = spec.name.text
                if (name === 'default') {
                    hasDefaultExport = true
                } else {
                    namedExports.set(name, spec.propertyName?.text)
                }
            }
        } else if (ts.isVariableStatement(stmt)
            && stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
            for (const spec of stmt.declarationList.declarations) {
                if (ts.isIdentifier(spec.name)) {
                    namedExports.set(spec.name.text, undefined)
                }
            }
        }
    }

    const newStmts: ts.Statement[] = [
        // context.factory.createVariableStatement(undefined, [
        //     context.factory.createVariableDeclaration(
        //         'exports',
        //         undefined,
        //         undefined,
        //         context.factory.createObjectLiteralExpression(),
        //     ),
        //     context.factory.createVariableDeclaration(
        //         'module',
        //         undefined,
        //         undefined,
        //         context.factory.createObjectLiteralExpression([
        //             context.factory.createShorthandPropertyAssignment('exports'),
        //         ]),
        //     ),
        // ]),
        ...sourceFile.statements,
    ]

    if (!hasDefaultExport) {
        const properties: ts.ObjectLiteralElementLike[] = []
        for (const [name, identifier] of namedExports.entries()) {
            properties.push((identifier
                ? context.factory.createPropertyAssignment(name, context.factory.createIdentifier(identifier))
                : context.factory.createShorthandPropertyAssignment(name)
            ))
        }
        const exportDefault = context.factory.createExportAssignment(
            undefined,
            false,
            context.factory.createObjectLiteralExpression(properties),
        )
        newStmts.push(exportDefault)
    }

    return context.factory.updateSourceFile(
        sourceFile,
        newStmts,
        sourceFile.isDeclarationFile,
        sourceFile.referencedFiles,
        sourceFile.typeReferenceDirectives,
        sourceFile.hasNoDefaultLib,
        sourceFile.libReferenceDirectives,
    )
}
