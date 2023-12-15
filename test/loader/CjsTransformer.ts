import { CjsTransformer } from '#src/loader/CjsTransformer'
import { ModuleLoader } from '#src/loader/ModuleLoader'

for (const [name, input, expected] of [
    [
        'add cjs module globals and default export `module.exports`',
        `
const foo = 'bar'
        `,
        `
var exports = {}, require = function() {
    return ({})[arguments[0]];
}, __M = {
    exports,
    require
}, module = __M;
const foo = 'bar';
export default __M.exports;
        `,
    ],
    [
        'add import for static require calls',
        `
const { a, b } = require('some-module');
const c = require('other-module');
const d = require('some-module');
const e = (() => require('third-module'))()
        `,
        `
import __I1 from "some-module";
import __I2 from "other-module";
import __I3 from "third-module";
var exports = {}, require = function() {
    return ({
        "some-module": __I1,
        "other-module": __I2,
        "third-module": __I3
    })[arguments[0]];
}, __M = {
    exports,
    require
}, module = __M;
const { a, b } = require('some-module');
const c = require('other-module');
const d = require('some-module');
const e = (()=>require('third-module'))();
export default __M.exports;
        `,
    ],
]) {
    test(`${name}`, async () => {
        const loader = new ModuleLoader(
            async () =>  input.trim().concat('\n'),
            '/project',
            {resolve: r => r},
            () => undefined,
            [new CjsTransformer({getJsModuleType: () => 'commonjs'})],
        )

        const resultCode = (await loader.load('file.js'))?.content.toString()
            .replace(/\/\/# sourceMappingURL=.*$/, '')
            .trim()

        expect(resultCode).toBe(expected.trim())
    })
}
