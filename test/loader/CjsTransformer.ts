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
const f = require('./some.json');
        `,
        `
import __I1 from "some-module";
import __I2 from "other-module";
import __I3 from "third-module";
import __I4 from "./some.json" assert {
    type: "json"
};
var exports = {}, require = function() {
    return ({
        "some-module": __I1,
        "other-module": __I2,
        "third-module": __I3,
        "./some.json": __I4
    })[arguments[0]];
}, __M = {
    exports,
    require
}, module = __M;
const { a, b } = require('some-module');
const c = require('other-module');
const d = require('some-module');
const e = (()=>require('third-module'))();
const f = require('./some.json');
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

// test('assert', async () => {
//     const input = `
// import X from './foo.json' assert {type: 'json'}
// console.log(X)
//     `
//     const expected = `
// import X from './foo.json' assert {
//     type: 'json'
// }
// console.log(X)
//     `
//     const loader = new ModuleLoader(
//         async () =>  input.trim().concat('\n'),
//         '/project',
//         {resolve: r => r},
//         () => undefined,
//         [{
//             transform(module, sourcePath, type) {
//                 console.log(type, JSON.stringify(module.body, null, 2))
//                 return module
//             },
//         }],
//     )

//     const resultCode = (await loader.load('file.js'))?.content.toString()
//         .replace(/\/\/# sourceMappingURL=.*$/, '')
//         .trim()

//     expect(resultCode).toBe(expected.trim())

// })
