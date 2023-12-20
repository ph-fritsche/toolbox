import swc from '@swc/core'
import { Visitor } from '@swc/core/Visitor.js'
import { ModuleTransformer } from './ModuleLoader'

export interface JsModuleTypeResolver {
    getJsModuleType: (sourcePath: string) => 'ecmascript'|'commonjs'|Promise<'ecmascript'|'commonjs'>
}

declare module '@swc/core' {
    export interface ImportDeclaration {
        with?: swc.ObjectExpression
    }
}
/**
 * Transform CommonJs modules to be EcmaScript compatible.
 *
 * - Declares CJS module globals: `module`, `exports` and `require`.
 * - Imports modules that are required per string literal.
 * - Adds default `export` of `module.exports`.
 *
 * The dynamic and synchronous nature of CJS module dependencies makes it impossible
 * to translate them equivalently to ESM, so there will always be uncovered edge cases.
 * This transformer errs on the side of simplicity and might work in most cases,
 * but will certainly fail in others.
 * Try to transpile those with the *much* slower `transpileCjsToEsm` utility or
 * any other transpiler – or convince the author of the module to just ship ESM.
 */
export class CjsTransformer implements ModuleTransformer {
    constructor(
        protected readonly packageConfigResolver: JsModuleTypeResolver,
    ) {}

    protected onUnsupportedRequire(sourcePath: string, start: number, end: number) {
        console.warn(`Unsupported require() call in ${sourcePath} at ${start} - ${end}`)
    }

    async transform(
        module: swc.Module,
        sourcePath: string,
        type: 'typescript' | 'ecmascript' | 'commonjs' | 'javascript',
    ): Promise<swc.Module> {
        const jsType = type === 'javascript'
            ? this.packageConfigResolver.getJsModuleType(sourcePath)
            : undefined

        if (type !== 'commonjs' && jsType !== 'commonjs') {
            return module
        }

        const f = new CjsNodeFactory(module)
        const v = new CjsVisitor((source, span) => {
            if (!source) {
                return this.onUnsupportedRequire(sourcePath, span.start - module.span.start, span.end - module.span.start)
            }
            f.addImport(source, span)
        })
        const m = v.visitModule(module)

        return {...m, body: [
            ...f.createModuleDeclaration(),
            ...m.body,
            f.createExportDefaultExpression(),
        ]}
    }

}

export class CjsNodeFactory {
    constructor(
        protected readonly module: swc.Module,
    ) {}

    protected readonly cjsModuleId = this.createModuleLevelIdentifier('__M')

    protected importCount = 0
    protected importMap: Record<string, {id: swc.Identifier, span: swc.Span}> = {}
    addImport(source: string, span: swc.Span) {
        if (!this.importMap[source]) {
            this.importMap[source] = {
                id: this.createModuleLevelIdentifier('__I' + String(++this.importCount)),
                span,
            }
        }
    }
    createImportDeclarations() {
        return Object.entries(this.importMap).map(([source, {id, span}]) => (
            this.createImportDefaultDeclaration(id, source, span)
        ))
    }

    createModuleLevelIdentifier(
        name: string,
    ) {
        return this.createIdentifier(name, {ctxt: 0})
    }

    createTopLevelIdentifier(
        name: string,
    ) {
        return this.createIdentifier(name, {ctxt: 1})
    }

    createIdentifier(
        name: string,
        span?: Partial<swc.Span>,
    ): swc.Identifier {
        return {
            type: 'Identifier',
            span: {...this.module.span, ...span},
            value: name,
            optional: false,
        }
    }

    createStringLiteral(
        value: string,
        span?: Partial<swc.Span>,
    ): swc.StringLiteral {
        return {
            type: 'StringLiteral',
            span: {...this.module.span, ...span},
            value,
        }
    }

    createImportDefaultDeclaration(
        specifier: swc.Identifier,
        source: string,
        span?: swc.Span,
    ): swc.ImportDeclaration {
        span = {...this.module.span, ...span, ctxt: 0}
        return {
            type: 'ImportDeclaration',
            span,
            specifiers: [{
                type: 'ImportDefaultSpecifier',
                span,
                local: specifier,
            }],
            source: {
                type: 'StringLiteral',
                span,
                value: source,
            },
            typeOnly: false,
            with: source.endsWith('.json')
                ? {
                    type: 'ObjectExpression',
                    span,
                    properties: [{
                        type: 'KeyValueProperty',
                        key: this.createIdentifier('type', span),
                        value: this.createStringLiteral('json', span),
                    }],
                }
                : undefined,
        }
    }

    createModuleDeclaration(): (swc.ImportDeclaration|swc.VariableDeclaration)[] {
        return [
            ...Object.entries(this.importMap).map(([source, {id, span}]) => (
                this.createImportDefaultDeclaration(id, source, span)
            )),
            {
                type: 'VariableDeclaration',
                span: this.module.span,
                declare: false,
                kind: 'var',
                declarations: [
                    {
                        type: 'VariableDeclarator',
                        id: this.createTopLevelIdentifier('exports'),
                        span: this.module.span,
                        definite: true,
                        init: {
                            type: 'ObjectExpression',
                            span: this.module.span,
                            properties: [],
                        },
                    },
                    {
                        type: 'VariableDeclarator',
                        id: this.createTopLevelIdentifier('require'),
                        span: this.module.span,
                        definite: true,
                        init: {
                            type: 'FunctionExpression',
                            span: this.module.span,
                            async: false,
                            generator: false,
                            params: [],
                            body: {
                                type: 'BlockStatement',
                                span: this.module.span,
                                stmts: [{
                                    type: 'ReturnStatement',
                                    span: this.module.span,
                                    argument: {
                                        type: 'MemberExpression',
                                        span: this.module.span,
                                        object: {
                                            type: 'ObjectExpression',
                                            span: this.module.span,
                                            properties: Object.entries(this.importMap).map(([source, {id, span}]) => ({
                                                type: 'KeyValueProperty',
                                                key: {
                                                    type: 'StringLiteral',
                                                    span,
                                                    value: source,
                                                },
                                                value: id,
                                            })),
                                        },
                                        property: {
                                            type: 'Computed',
                                            span: this.module.span,
                                            expression: {
                                                type: 'MemberExpression',
                                                span: this.module.span,
                                                object: this.createModuleLevelIdentifier('arguments'),
                                                property: {
                                                    type: 'Computed',
                                                    span: this.module.span,
                                                    expression: {
                                                        type: 'NumericLiteral',
                                                        span: this.module.span,
                                                        value: 0,
                                                    },
                                                },
                                            },
                                        },
                                    },
                                }],
                            },
                        },
                    },
                    {
                        type: 'VariableDeclarator',
                        id: this.cjsModuleId,
                        span: this.module.span,
                        definite: true,
                        init: {
                            type: 'ObjectExpression',
                            span: this.module.span,
                            properties: [
                                this.createTopLevelIdentifier('exports'),
                                this.createTopLevelIdentifier('require'),
                            ],
                        },
                    },
                    {
                        type: 'VariableDeclarator',
                        id: this.createTopLevelIdentifier('module'),
                        span: this.module.span,
                        definite: true,
                        init: this.cjsModuleId,
                    },
                ],
            },
        ]
    }

    createExportDefaultExpression(): swc.ExportDefaultExpression {
        return {
            type: 'ExportDefaultExpression',
            span: this.module.span,
            expression: {
                type: 'MemberExpression',
                span: this.module.span,
                object: this.cjsModuleId,
                property: this.createTopLevelIdentifier('exports'),
            },
        }
    }
}

export class CjsVisitor extends Visitor {
    constructor(
        protected readonly onRequire: (source: string|undefined, span: swc.Span) => void,
    ) {
        super()
    }

    protected isModule(n: swc.Expression) {
        if (n.type === 'Identifier') {
            return n.value === 'module' && n.span.ctxt === 1
        }
    }

    protected isRequire(n: swc.Expression) {
        if (n.type === 'Identifier') {
            return n.value === 'require' && n.span.ctxt === 1
        } else if (n.type === 'MemberExpression') {
            return this.isModule(n.object)
                && (
                    n.property.type === 'Identifier' && n.property.value === 'require'
                    || n.property.type === 'Computed' && this.isStaticString(n.property.expression, 'require')
                )
        }
    }

    protected isStaticString(n: swc.Expression, s: string) {
        if (n.type === 'StringLiteral') {
            return n.value === s
        }
        return false
    }

    visitCallExpression(n: swc.CallExpression): swc.Expression {
        if (n.callee.type !== 'Super'
            && n.callee.type !== 'Import'
            && this.isRequire(n.callee)
        ) {
            this.onRequire(
                (n.arguments.length === 1 && n.arguments[0].expression.type === 'StringLiteral')
                    ? n.arguments[0].expression.value
                    : undefined,
                n.span,
            )
        }
        return Visitor.prototype.visitCallExpression.call(this, n)
    }
}
