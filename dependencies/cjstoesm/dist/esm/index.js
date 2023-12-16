import resolve from 'resolve';
import path, { normalize } from 'crosspath';
import fs from 'fs';
import { camelCase } from '@wessberg/stringutil';
import { check } from 'reserved-words';
import color from 'ansi-colors';
import ts from 'typescript';
import { ensureNodeFactory } from 'compatfactory';
import { inspect } from 'util';
import fastGlob from 'fast-glob';

const KNOWN_EXTENSIONS = [
    ".d.ts",
    ".d.dts.map",
    ".js.map",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".mjs.map",
    ".mjsx",
    ".cjs",
    ".cjs.map",
    ".csjx",
    ".d.cts",
    ".d.cts.map",
    ".d.mts",
    ".d.mts.map",
    ".json",
    ".tsbuildinfo"
];
/**
 * Ensure that the given path has a leading "."
 */
function ensureHasLeadingDotAndPosix(p) {
    const posixPath = normalize(p);
    if (posixPath.startsWith("."))
        return posixPath;
    if (posixPath.startsWith("/"))
        return `.${posixPath}`;
    return `./${posixPath}`;
}
/**
 * Strips the extension from a file
 */
function stripKnownExtension(file) {
    let currentExtname;
    for (const extName of KNOWN_EXTENSIONS) {
        if (file.endsWith(extName)) {
            currentExtname = extName;
            break;
        }
    }
    if (currentExtname == null)
        return file;
    return file.slice(0, file.lastIndexOf(currentExtname));
}
/**
 * Sets the given extension for the given file
 */
function setExtension(file, extension) {
    return normalize(`${stripKnownExtension(file)}${extension}`);
}
/**
 * Returns true if the given path represents an external library
 */
function isExternalLibrary(p) {
    return !p.startsWith(".") && !p.startsWith("/");
}
function isJsonModule(p) {
    return p.endsWith(`.json`);
}

/**
 * Ensures that the given item is in fact an array
 */
function ensureArray(item) {
    return Array.isArray(item) ? item : [item];
}
function getFolderClosestToRoot(root, files) {
    const [head] = files;
    if (head == null) {
        throw new ReferenceError(`At least 1 file must be provided`);
    }
    let candidate = head;
    for (const file of files) {
        const relativeToRoot = path.relative(root, file);
        if (relativeToRoot.split("/").length < candidate.split("/").length) {
            candidate = relativeToRoot;
        }
    }
    return path.join(root, path.dirname(candidate));
}
function normalizeGlob(glob) {
    return path.extname(glob) === "" && !glob.endsWith("*") ? `${glob}/*` : glob;
}
// eslint-disable-next-line @typescript-eslint/ban-types
function isRecord(value) {
    return (!Array.isArray(value) &&
        typeof value === "object" &&
        value != null &&
        !(value instanceof Date) &&
        !(value instanceof Set) &&
        !(value instanceof WeakSet) &&
        !(value instanceof Map) &&
        !(value instanceof WeakMap));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Computes a cache key based on the combination of id and parent
 */
function computeCacheKey(id, parent) {
    return isExternalLibrary(id) ? id : `${parent == null ? "" : `${parent}->`}${id}`;
}
/**
 * A function that can resolve an import path
 */
function resolvePath({ id, parent, cwd, prioritizedPackageKeys = ["exports", "es2015", "esm2015", "module", "jsnext:main", "main", "browser"], prioritizedExtensions = ["", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".json"], moduleDirectory = "node_modules", fileSystem, resolveCache }) {
    var _a, _b;
    id = path.normalize(id);
    if (parent != null) {
        parent = path.normalize(parent);
    }
    const cacheKey = computeCacheKey(id, parent);
    // Attempt to take the resolve result from the cache
    const cacheResult = resolveCache.get(cacheKey);
    // If it is a proper path, return it
    if (cacheResult != null)
        return cacheResult;
    // Otherwise, if the cache result isn't strictly equal to 'undefined', it has previously been resolved to a non-existing file
    if (cacheResult === null)
        return;
    if (!isExternalLibrary(id)) {
        const absolute = path.isAbsolute(id) ? path.normalize(id) : path.join(parent == null ? "" : path.dirname(parent), id);
        const variants = [absolute, path.join(absolute, "index")];
        for (const variant of variants) {
            for (const ext of prioritizedExtensions) {
                const withExtension = `${variant}${ext}`;
                if ((_b = (_a = fileSystem.safeStatSync(withExtension)) === null || _a === void 0 ? void 0 : _a.isFile()) !== null && _b !== void 0 ? _b : false) {
                    // Add it to the cache
                    resolveCache.set(cacheKey, withExtension);
                    return withExtension;
                }
            }
        }
        // Add it to the cache and mark it as unresolvable
        resolveCache.set(cacheKey, null);
        return undefined;
    }
    // Otherwise, try to resolve it via node module resolution and put it in the cache
    try {
        const resolveResult = path.normalize(resolve.sync(id, {
            basedir: path.normalize(cwd),
            extensions: prioritizedExtensions,
            moduleDirectory: moduleDirectory,
            readFileSync: p => fileSystem.readFileSync(p).toString(),
            isFile: p => { var _a, _b; return (_b = (_a = fileSystem.safeStatSync(p)) === null || _a === void 0 ? void 0 : _a.isFile()) !== null && _b !== void 0 ? _b : false; },
            isDirectory: p => { var _a, _b; return (_b = (_a = fileSystem.safeStatSync(p)) === null || _a === void 0 ? void 0 : _a.isDirectory()) !== null && _b !== void 0 ? _b : false; },
            packageFilter(pkg) {
                let property;
                //  Otherwise, or if no key was selected, use the prioritized list of fields and take the first matched one
                if (property == null) {
                    const packageKeys = Object.keys(pkg);
                    property = prioritizedPackageKeys.find(key => packageKeys.includes(key));
                }
                // If a property was resolved, set the 'main' property to it (resolve will use the main property no matter what)
                if (property != null) {
                    let pickedProperty = pkg[property];
                    while (isRecord(pickedProperty)) {
                        if ("import" in pickedProperty) {
                            pickedProperty = pickedProperty.import;
                        }
                        else if ("." in pickedProperty) {
                            pickedProperty = pickedProperty["."];
                        }
                        else if ("default" in pickedProperty) {
                            pickedProperty = pickedProperty.default;
                        }
                        else if ("require" in pickedProperty) {
                            pickedProperty = pickedProperty.require;
                        }
                        else {
                            pickedProperty = pickedProperty[Object.keys(pickedProperty)[0]];
                        }
                    }
                    pkg.main = pickedProperty;
                }
                // Return the package
                return pkg;
            }
        }));
        // Add it to the cache
        resolveCache.set(cacheKey, resolveResult);
        // Return it
        return resolveResult;
    }
    catch (ex) {
        // No file could be resolved. Set it in the cache as unresolvable and return void
        resolveCache.set(cacheKey, null);
        // Return undefined¬
        return undefined;
    }
}

function walkThroughFillerNodes(expression, typescript) {
    // noinspection JSDeprecatedSymbols
    if (typescript.isParenthesizedExpression(expression) ||
        typescript.isAsExpression(expression) ||
        isTypeAssertion(typescript)(expression) ||
        typescript.isNonNullExpression(expression) ||
        typescript.isExpressionWithTypeArguments(expression)) {
        return expression.expression;
    }
    return expression;
}
function isTypeAssertion(typescript) {
    const t = typescript;
    return 'isTypeAssertionExpression' in t
        ? t.isTypeAssertionExpression
        : t.isTypeAssertion;
}

/* eslint-disable */
/**
 * @file This file is auto-generated. Do not change its contents.
 */
const BUILT_IN_MODULE = new Set([
    "assert",
    "assert/strict",
    "async_hooks",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "diagnostics_channel",
    "dns",
    "dns/promises",
    "domain",
    "events",
    "fs",
    "fs/promises",
    "http",
    "http2",
    "https",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "path/posix",
    "path/win32",
    "perf_hooks",
    "process",
    "punycode",
    "querystring",
    "readline",
    "readline/promises",
    "repl",
    "stream",
    "stream/consumers",
    "stream/promises",
    "stream/web",
    "string_decoder",
    "timers",
    "timers/promises",
    "tls",
    "trace_events",
    "tty",
    "url",
    "util",
    "util/types",
    "v8",
    "vm",
    "worker_threads",
    "zlib"
]);
function isBuiltInModule(moduleName) {
    return BUILT_IN_MODULE.has(moduleName);
}
const BUILT_IN_MODULE_MAP = {
    assert: {
        namedExports: new Set([]),
        hasDefaultExport: true
    },
    "assert/strict": {
        namedExports: new Set([]),
        hasDefaultExport: true
    },
    async_hooks: {
        namedExports: new Set(["AsyncLocalStorage", "createHook", "executionAsyncId", "triggerAsyncId", "executionAsyncResource", "asyncWrapProviders", "AsyncResource"]),
        hasDefaultExport: true
    },
    buffer: {
        namedExports: new Set(["Blob", "resolveObjectURL", "Buffer", "SlowBuffer", "transcode", "kMaxLength", "kStringMaxLength", "btoa", "atob", "constants", "INSPECT_MAX_BYTES"]),
        hasDefaultExport: true
    },
    child_process: {
        namedExports: new Set(["ChildProcess", "exec", "execFile", "execFileSync", "execSync", "fork", "spawn", "spawnSync"]),
        hasDefaultExport: true
    },
    cluster: {
        namedExports: new Set([
            "isWorker",
            "isMaster",
            "isPrimary",
            "Worker",
            "workers",
            "settings",
            "SCHED_NONE",
            "SCHED_RR",
            "schedulingPolicy",
            "setupPrimary",
            "setupMaster",
            "fork",
            "disconnect"
        ]),
        hasDefaultExport: true
    },
    console: {
        namedExports: new Set([
            "log",
            "warn",
            "dir",
            "time",
            "timeEnd",
            "timeLog",
            "trace",
            "assert",
            "clear",
            "count",
            "countReset",
            "group",
            "groupEnd",
            "table",
            "debug",
            "info",
            "dirxml",
            "error",
            "groupCollapsed",
            "Console",
            "profile",
            "profileEnd",
            "timeStamp",
            "context"
        ]),
        hasDefaultExport: true
    },
    constants: {
        namedExports: new Set([
            "E2BIG",
            "EACCES",
            "EADDRINUSE",
            "EADDRNOTAVAIL",
            "EAFNOSUPPORT",
            "EAGAIN",
            "EALREADY",
            "EBADF",
            "EBADMSG",
            "EBUSY",
            "ECANCELED",
            "ECHILD",
            "ECONNABORTED",
            "ECONNREFUSED",
            "ECONNRESET",
            "EDEADLK",
            "EDESTADDRREQ",
            "EDOM",
            "EEXIST",
            "EFAULT",
            "EFBIG",
            "EHOSTUNREACH",
            "EIDRM",
            "EILSEQ",
            "EINPROGRESS",
            "EINTR",
            "EINVAL",
            "EIO",
            "EISCONN",
            "EISDIR",
            "ELOOP",
            "EMFILE",
            "EMLINK",
            "EMSGSIZE",
            "ENAMETOOLONG",
            "ENETDOWN",
            "ENETRESET",
            "ENETUNREACH",
            "ENFILE",
            "ENOBUFS",
            "ENODATA",
            "ENODEV",
            "ENOENT",
            "ENOEXEC",
            "ENOLCK",
            "ENOLINK",
            "ENOMEM",
            "ENOMSG",
            "ENOPROTOOPT",
            "ENOSPC",
            "ENOSR",
            "ENOSTR",
            "ENOSYS",
            "ENOTCONN",
            "ENOTDIR",
            "ENOTEMPTY",
            "ENOTSOCK",
            "ENOTSUP",
            "ENOTTY",
            "ENXIO",
            "EOPNOTSUPP",
            "EOVERFLOW",
            "EPERM",
            "EPIPE",
            "EPROTO",
            "EPROTONOSUPPORT",
            "EPROTOTYPE",
            "ERANGE",
            "EROFS",
            "ESPIPE",
            "ESRCH",
            "ETIME",
            "ETIMEDOUT",
            "ETXTBSY",
            "EWOULDBLOCK",
            "EXDEV",
            "WSAEINTR",
            "WSAEBADF",
            "WSAEACCES",
            "WSAEFAULT",
            "WSAEINVAL",
            "WSAEMFILE",
            "WSAEWOULDBLOCK",
            "WSAEINPROGRESS",
            "WSAEALREADY",
            "WSAENOTSOCK",
            "WSAEDESTADDRREQ",
            "WSAEMSGSIZE",
            "WSAEPROTOTYPE",
            "WSAENOPROTOOPT",
            "WSAEPROTONOSUPPORT",
            "WSAESOCKTNOSUPPORT",
            "WSAEOPNOTSUPP",
            "WSAEPFNOSUPPORT",
            "WSAEAFNOSUPPORT",
            "WSAEADDRINUSE",
            "WSAEADDRNOTAVAIL",
            "WSAENETDOWN",
            "WSAENETUNREACH",
            "WSAENETRESET",
            "WSAECONNABORTED",
            "WSAECONNRESET",
            "WSAENOBUFS",
            "WSAEISCONN",
            "WSAENOTCONN",
            "WSAESHUTDOWN",
            "WSAETOOMANYREFS",
            "WSAETIMEDOUT",
            "WSAECONNREFUSED",
            "WSAELOOP",
            "WSAENAMETOOLONG",
            "WSAEHOSTDOWN",
            "WSAEHOSTUNREACH",
            "WSAENOTEMPTY",
            "WSAEPROCLIM",
            "WSAEUSERS",
            "WSAEDQUOT",
            "WSAESTALE",
            "WSAEREMOTE",
            "WSASYSNOTREADY",
            "WSAVERNOTSUPPORTED",
            "WSANOTINITIALISED",
            "WSAEDISCON",
            "WSAENOMORE",
            "WSAECANCELLED",
            "WSAEINVALIDPROCTABLE",
            "WSAEINVALIDPROVIDER",
            "WSAEPROVIDERFAILEDINIT",
            "WSASYSCALLFAILURE",
            "WSASERVICE_NOT_FOUND",
            "WSATYPE_NOT_FOUND",
            "WSA_E_NO_MORE",
            "WSA_E_CANCELLED",
            "WSAEREFUSED",
            "PRIORITY_LOW",
            "PRIORITY_BELOW_NORMAL",
            "PRIORITY_NORMAL",
            "PRIORITY_ABOVE_NORMAL",
            "PRIORITY_HIGH",
            "PRIORITY_HIGHEST",
            "SIGHUP",
            "SIGINT",
            "SIGILL",
            "SIGABRT",
            "SIGFPE",
            "SIGKILL",
            "SIGSEGV",
            "SIGTERM",
            "SIGBREAK",
            "SIGWINCH",
            "UV_FS_SYMLINK_DIR",
            "UV_FS_SYMLINK_JUNCTION",
            "O_RDONLY",
            "O_WRONLY",
            "O_RDWR",
            "UV_DIRENT_UNKNOWN",
            "UV_DIRENT_FILE",
            "UV_DIRENT_DIR",
            "UV_DIRENT_LINK",
            "UV_DIRENT_FIFO",
            "UV_DIRENT_SOCKET",
            "UV_DIRENT_CHAR",
            "UV_DIRENT_BLOCK",
            "S_IFMT",
            "S_IFREG",
            "S_IFDIR",
            "S_IFCHR",
            "S_IFLNK",
            "O_CREAT",
            "O_EXCL",
            "UV_FS_O_FILEMAP",
            "O_TRUNC",
            "O_APPEND",
            "S_IRUSR",
            "S_IWUSR",
            "F_OK",
            "R_OK",
            "W_OK",
            "X_OK",
            "UV_FS_COPYFILE_EXCL",
            "COPYFILE_EXCL",
            "UV_FS_COPYFILE_FICLONE",
            "COPYFILE_FICLONE",
            "UV_FS_COPYFILE_FICLONE_FORCE",
            "COPYFILE_FICLONE_FORCE",
            "OPENSSL_VERSION_NUMBER",
            "SSL_OP_ALL",
            "SSL_OP_ALLOW_NO_DHE_KEX",
            "SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION",
            "SSL_OP_CIPHER_SERVER_PREFERENCE",
            "SSL_OP_CISCO_ANYCONNECT",
            "SSL_OP_COOKIE_EXCHANGE",
            "SSL_OP_CRYPTOPRO_TLSEXT_BUG",
            "SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS",
            "SSL_OP_EPHEMERAL_RSA",
            "SSL_OP_LEGACY_SERVER_CONNECT",
            "SSL_OP_MICROSOFT_BIG_SSLV3_BUFFER",
            "SSL_OP_MICROSOFT_SESS_ID_BUG",
            "SSL_OP_MSIE_SSLV2_RSA_PADDING",
            "SSL_OP_NETSCAPE_CA_DN_BUG",
            "SSL_OP_NETSCAPE_CHALLENGE_BUG",
            "SSL_OP_NETSCAPE_DEMO_CIPHER_CHANGE_BUG",
            "SSL_OP_NETSCAPE_REUSE_CIPHER_CHANGE_BUG",
            "SSL_OP_NO_COMPRESSION",
            "SSL_OP_NO_ENCRYPT_THEN_MAC",
            "SSL_OP_NO_QUERY_MTU",
            "SSL_OP_NO_RENEGOTIATION",
            "SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION",
            "SSL_OP_NO_SSLv2",
            "SSL_OP_NO_SSLv3",
            "SSL_OP_NO_TICKET",
            "SSL_OP_NO_TLSv1",
            "SSL_OP_NO_TLSv1_1",
            "SSL_OP_NO_TLSv1_2",
            "SSL_OP_NO_TLSv1_3",
            "SSL_OP_PKCS1_CHECK_1",
            "SSL_OP_PKCS1_CHECK_2",
            "SSL_OP_PRIORITIZE_CHACHA",
            "SSL_OP_SINGLE_DH_USE",
            "SSL_OP_SINGLE_ECDH_USE",
            "SSL_OP_SSLEAY_080_CLIENT_DH_BUG",
            "SSL_OP_SSLREF2_REUSE_CERT_TYPE_BUG",
            "SSL_OP_TLS_BLOCK_PADDING_BUG",
            "SSL_OP_TLS_D5_BUG",
            "SSL_OP_TLS_ROLLBACK_BUG",
            "ENGINE_METHOD_RSA",
            "ENGINE_METHOD_DSA",
            "ENGINE_METHOD_DH",
            "ENGINE_METHOD_RAND",
            "ENGINE_METHOD_EC",
            "ENGINE_METHOD_CIPHERS",
            "ENGINE_METHOD_DIGESTS",
            "ENGINE_METHOD_PKEY_METHS",
            "ENGINE_METHOD_PKEY_ASN1_METHS",
            "ENGINE_METHOD_ALL",
            "ENGINE_METHOD_NONE",
            "DH_CHECK_P_NOT_SAFE_PRIME",
            "DH_CHECK_P_NOT_PRIME",
            "DH_UNABLE_TO_CHECK_GENERATOR",
            "DH_NOT_SUITABLE_GENERATOR",
            "ALPN_ENABLED",
            "RSA_PKCS1_PADDING",
            "RSA_NO_PADDING",
            "RSA_PKCS1_OAEP_PADDING",
            "RSA_X931_PADDING",
            "RSA_PKCS1_PSS_PADDING",
            "RSA_PSS_SALTLEN_DIGEST",
            "RSA_PSS_SALTLEN_MAX_SIGN",
            "RSA_PSS_SALTLEN_AUTO",
            "defaultCoreCipherList",
            "TLS1_VERSION",
            "TLS1_1_VERSION",
            "TLS1_2_VERSION",
            "TLS1_3_VERSION",
            "POINT_CONVERSION_COMPRESSED",
            "POINT_CONVERSION_UNCOMPRESSED",
            "POINT_CONVERSION_HYBRID",
            "defaultCipherList"
        ]),
        hasDefaultExport: true
    },
    crypto: {
        namedExports: new Set([
            "checkPrime",
            "checkPrimeSync",
            "createCipheriv",
            "createDecipheriv",
            "createDiffieHellman",
            "createDiffieHellmanGroup",
            "createECDH",
            "createHash",
            "createHmac",
            "createPrivateKey",
            "createPublicKey",
            "createSecretKey",
            "createSign",
            "createVerify",
            "diffieHellman",
            "generatePrime",
            "generatePrimeSync",
            "getCiphers",
            "getCipherInfo",
            "getCurves",
            "getDiffieHellman",
            "getHashes",
            "hkdf",
            "hkdfSync",
            "pbkdf2",
            "pbkdf2Sync",
            "generateKeyPair",
            "generateKeyPairSync",
            "generateKey",
            "generateKeySync",
            "privateDecrypt",
            "privateEncrypt",
            "publicDecrypt",
            "publicEncrypt",
            "randomBytes",
            "randomFill",
            "randomFillSync",
            "randomInt",
            "randomUUID",
            "scrypt",
            "scryptSync",
            "sign",
            "setEngine",
            "timingSafeEqual",
            "getFips",
            "setFips",
            "verify",
            "Certificate",
            "Cipher",
            "Cipheriv",
            "Decipher",
            "Decipheriv",
            "DiffieHellman",
            "DiffieHellmanGroup",
            "ECDH",
            "Hash",
            "Hmac",
            "KeyObject",
            "Sign",
            "Verify",
            "X509Certificate",
            "secureHeapUsed",
            "constants",
            "webcrypto",
            "subtle",
            "getRandomValues"
        ]),
        hasDefaultExport: true
    },
    dgram: {
        namedExports: new Set(["createSocket", "Socket"]),
        hasDefaultExport: true
    },
    diagnostics_channel: {
        namedExports: new Set(["channel", "hasSubscribers", "Channel"]),
        hasDefaultExport: true
    },
    dns: {
        namedExports: new Set([
            "lookup",
            "lookupService",
            "Resolver",
            "setDefaultResultOrder",
            "setServers",
            "ADDRCONFIG",
            "ALL",
            "V4MAPPED",
            "NODATA",
            "FORMERR",
            "SERVFAIL",
            "NOTFOUND",
            "NOTIMP",
            "REFUSED",
            "BADQUERY",
            "BADNAME",
            "BADFAMILY",
            "BADRESP",
            "CONNREFUSED",
            "TIMEOUT",
            "EOF",
            "FILE",
            "NOMEM",
            "DESTRUCTION",
            "BADSTR",
            "BADFLAGS",
            "NONAME",
            "BADHINTS",
            "NOTINITIALIZED",
            "LOADIPHLPAPI",
            "ADDRGETNETWORKPARAMS",
            "CANCELLED",
            "getServers",
            "resolve",
            "resolve4",
            "resolve6",
            "resolveAny",
            "resolveCaa",
            "resolveCname",
            "resolveMx",
            "resolveNaptr",
            "resolveNs",
            "resolvePtr",
            "resolveSoa",
            "resolveSrv",
            "resolveTxt",
            "reverse",
            "promises"
        ]),
        hasDefaultExport: true
    },
    "dns/promises": {
        namedExports: new Set([
            "lookup",
            "lookupService",
            "Resolver",
            "getServers",
            "resolve",
            "resolve4",
            "resolve6",
            "resolveAny",
            "resolveCaa",
            "resolveCname",
            "resolveMx",
            "resolveNaptr",
            "resolveNs",
            "resolvePtr",
            "resolveSoa",
            "resolveSrv",
            "resolveTxt",
            "reverse",
            "setServers",
            "setDefaultResultOrder"
        ]),
        hasDefaultExport: true
    },
    domain: {
        namedExports: new Set(["Domain", "createDomain", "create", "active"]),
        hasDefaultExport: true
    },
    events: {
        namedExports: new Set([]),
        hasDefaultExport: true
    },
    fs: {
        namedExports: new Set([
            "appendFile",
            "appendFileSync",
            "access",
            "accessSync",
            "chown",
            "chownSync",
            "chmod",
            "chmodSync",
            "close",
            "closeSync",
            "copyFile",
            "copyFileSync",
            "cp",
            "cpSync",
            "createReadStream",
            "createWriteStream",
            "exists",
            "existsSync",
            "fchown",
            "fchownSync",
            "fchmod",
            "fchmodSync",
            "fdatasync",
            "fdatasyncSync",
            "fstat",
            "fstatSync",
            "fsync",
            "fsyncSync",
            "ftruncate",
            "ftruncateSync",
            "futimes",
            "futimesSync",
            "lchown",
            "lchownSync",
            "lchmod",
            "lchmodSync",
            "link",
            "linkSync",
            "lstat",
            "lstatSync",
            "lutimes",
            "lutimesSync",
            "mkdir",
            "mkdirSync",
            "mkdtemp",
            "mkdtempSync",
            "open",
            "openSync",
            "opendir",
            "opendirSync",
            "readdir",
            "readdirSync",
            "read",
            "readSync",
            "readv",
            "readvSync",
            "readFile",
            "readFileSync",
            "readlink",
            "readlinkSync",
            "realpath",
            "realpathSync",
            "rename",
            "renameSync",
            "rm",
            "rmSync",
            "rmdir",
            "rmdirSync",
            "stat",
            "statSync",
            "symlink",
            "symlinkSync",
            "truncate",
            "truncateSync",
            "unwatchFile",
            "unlink",
            "unlinkSync",
            "utimes",
            "utimesSync",
            "watch",
            "watchFile",
            "writeFile",
            "writeFileSync",
            "write",
            "writeSync",
            "writev",
            "writevSync",
            "Dir",
            "Dirent",
            "Stats",
            "ReadStream",
            "WriteStream",
            "FileReadStream",
            "FileWriteStream",
            "F_OK",
            "R_OK",
            "W_OK",
            "X_OK",
            "constants",
            "promises"
        ]),
        hasDefaultExport: true
    },
    "fs/promises": {
        namedExports: new Set([
            "access",
            "copyFile",
            "cp",
            "open",
            "opendir",
            "rename",
            "truncate",
            "rm",
            "rmdir",
            "mkdir",
            "readdir",
            "readlink",
            "symlink",
            "lstat",
            "stat",
            "link",
            "unlink",
            "chmod",
            "lchmod",
            "lchown",
            "chown",
            "utimes",
            "lutimes",
            "realpath",
            "mkdtemp",
            "writeFile",
            "appendFile",
            "readFile",
            "watch"
        ]),
        hasDefaultExport: true
    },
    http: {
        namedExports: new Set([
            "METHODS",
            "STATUS_CODES",
            "Agent",
            "ClientRequest",
            "IncomingMessage",
            "OutgoingMessage",
            "Server",
            "ServerResponse",
            "createServer",
            "validateHeaderName",
            "validateHeaderValue",
            "get",
            "request",
            "maxHeaderSize",
            "globalAgent"
        ]),
        hasDefaultExport: true
    },
    http2: {
        namedExports: new Set([
            "connect",
            "constants",
            "createServer",
            "createSecureServer",
            "getDefaultSettings",
            "getPackedSettings",
            "getUnpackedSettings",
            "sensitiveHeaders",
            "Http2ServerRequest",
            "Http2ServerResponse"
        ]),
        hasDefaultExport: true
    },
    https: {
        namedExports: new Set(["Agent", "globalAgent", "Server", "createServer", "get", "request"]),
        hasDefaultExport: true
    },
    inspector: {
        namedExports: new Set(["open", "close", "url", "waitForDebugger", "console", "Session"]),
        hasDefaultExport: true
    },
    module: {
        namedExports: new Set([]),
        hasDefaultExport: true
    },
    net: {
        namedExports: new Set(["BlockList", "SocketAddress", "connect", "createConnection", "createServer", "isIP", "isIPv4", "isIPv6", "Server", "Socket", "Stream"]),
        hasDefaultExport: true
    },
    os: {
        namedExports: new Set([
            "arch",
            "cpus",
            "endianness",
            "freemem",
            "getPriority",
            "homedir",
            "hostname",
            "loadavg",
            "networkInterfaces",
            "platform",
            "release",
            "setPriority",
            "tmpdir",
            "totalmem",
            "type",
            "userInfo",
            "uptime",
            "version",
            "constants",
            "EOL",
            "devNull"
        ]),
        hasDefaultExport: true
    },
    path: {
        namedExports: new Set([
            "resolve",
            "normalize",
            "isAbsolute",
            "join",
            "relative",
            "toNamespacedPath",
            "dirname",
            "basename",
            "extname",
            "format",
            "parse",
            "sep",
            "delimiter",
            "win32",
            "posix"
        ]),
        hasDefaultExport: true
    },
    "path/posix": {
        namedExports: new Set([
            "resolve",
            "normalize",
            "isAbsolute",
            "join",
            "relative",
            "toNamespacedPath",
            "dirname",
            "basename",
            "extname",
            "format",
            "parse",
            "sep",
            "delimiter",
            "win32",
            "posix"
        ]),
        hasDefaultExport: true
    },
    "path/win32": {
        namedExports: new Set([
            "resolve",
            "normalize",
            "isAbsolute",
            "join",
            "relative",
            "toNamespacedPath",
            "dirname",
            "basename",
            "extname",
            "format",
            "parse",
            "sep",
            "delimiter",
            "win32",
            "posix"
        ]),
        hasDefaultExport: true
    },
    perf_hooks: {
        namedExports: new Set([
            "PerformanceEntry",
            "PerformanceMark",
            "PerformanceMeasure",
            "PerformanceObserver",
            "PerformanceObserverEntryList",
            "PerformanceResourceTiming",
            "monitorEventLoopDelay",
            "createHistogram",
            "performance",
            "constants"
        ]),
        hasDefaultExport: true
    },
    process: {
        namedExports: new Set([
            "version",
            "versions",
            "arch",
            "platform",
            "release",
            "moduleLoadList",
            "binding",
            "domain",
            "config",
            "dlopen",
            "uptime",
            "getActiveResourcesInfo",
            "reallyExit",
            "cpuUsage",
            "resourceUsage",
            "memoryUsage",
            "kill",
            "exit",
            "hrtime",
            "openStdin",
            "allowedNodeEnvironmentFlags",
            "assert",
            "features",
            "setUncaughtExceptionCaptureCallback",
            "hasUncaughtExceptionCaptureCallback",
            "emitWarning",
            "nextTick",
            "stdout",
            "stdin",
            "stderr",
            "abort",
            "umask",
            "chdir",
            "cwd",
            "env",
            "title",
            "argv",
            "execArgv",
            "pid",
            "ppid",
            "execPath",
            "debugPort",
            "argv0",
            "exitCode",
            "report",
            "setSourceMapsEnabled",
            "mainModule",
            "emit"
        ]),
        hasDefaultExport: true
    },
    punycode: {
        namedExports: new Set(["version", "ucs2", "decode", "encode", "toASCII", "toUnicode"]),
        hasDefaultExport: true
    },
    querystring: {
        namedExports: new Set(["unescapeBuffer", "unescape", "escape", "stringify", "encode", "parse", "decode"]),
        hasDefaultExport: true
    },
    readline: {
        namedExports: new Set(["Interface", "clearLine", "clearScreenDown", "createInterface", "cursorTo", "emitKeypressEvents", "moveCursor", "promises"]),
        hasDefaultExport: true
    },
    "readline/promises": {
        namedExports: new Set(["Interface", "Readline", "createInterface"]),
        hasDefaultExport: true
    },
    repl: {
        namedExports: new Set(["start", "writer", "REPLServer", "REPL_MODE_SLOPPY", "REPL_MODE_STRICT", "Recoverable", "builtinModules"]),
        hasDefaultExport: true
    },
    stream: {
        namedExports: new Set([]),
        hasDefaultExport: true
    },
    "stream/consumers": {
        namedExports: new Set(["arrayBuffer", "blob", "buffer", "text", "json"]),
        hasDefaultExport: true
    },
    "stream/promises": {
        namedExports: new Set(["finished", "pipeline"]),
        hasDefaultExport: true
    },
    "stream/web": {
        namedExports: new Set([
            "ReadableStream",
            "ReadableStreamDefaultReader",
            "ReadableStreamBYOBReader",
            "ReadableStreamBYOBRequest",
            "ReadableByteStreamController",
            "ReadableStreamDefaultController",
            "TransformStream",
            "TransformStreamDefaultController",
            "WritableStream",
            "WritableStreamDefaultWriter",
            "WritableStreamDefaultController",
            "ByteLengthQueuingStrategy",
            "CountQueuingStrategy",
            "TextEncoderStream",
            "TextDecoderStream",
            "CompressionStream",
            "DecompressionStream"
        ]),
        hasDefaultExport: true
    },
    string_decoder: {
        namedExports: new Set(["StringDecoder"]),
        hasDefaultExport: true
    },
    timers: {
        namedExports: new Set(["setTimeout", "clearTimeout", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "active", "unenroll", "enroll"]),
        hasDefaultExport: true
    },
    "timers/promises": {
        namedExports: new Set(["setTimeout", "setImmediate", "setInterval", "scheduler"]),
        hasDefaultExport: true
    },
    tls: {
        namedExports: new Set([
            "CLIENT_RENEG_LIMIT",
            "CLIENT_RENEG_WINDOW",
            "DEFAULT_CIPHERS",
            "DEFAULT_ECDH_CURVE",
            "DEFAULT_MIN_VERSION",
            "DEFAULT_MAX_VERSION",
            "getCiphers",
            "rootCertificates",
            "convertALPNProtocols",
            "checkServerIdentity",
            "createSecureContext",
            "SecureContext",
            "TLSSocket",
            "Server",
            "createServer",
            "connect",
            "createSecurePair"
        ]),
        hasDefaultExport: true
    },
    trace_events: {
        namedExports: new Set(["createTracing", "getEnabledCategories"]),
        hasDefaultExport: true
    },
    tty: {
        namedExports: new Set(["isatty", "ReadStream", "WriteStream"]),
        hasDefaultExport: true
    },
    url: {
        namedExports: new Set([
            "Url",
            "parse",
            "resolve",
            "resolveObject",
            "format",
            "URL",
            "URLSearchParams",
            "domainToASCII",
            "domainToUnicode",
            "pathToFileURL",
            "fileURLToPath",
            "urlToHttpOptions"
        ]),
        hasDefaultExport: true
    },
    util: {
        namedExports: new Set([
            "callbackify",
            "debug",
            "debuglog",
            "deprecate",
            "format",
            "formatWithOptions",
            "getSystemErrorMap",
            "getSystemErrorName",
            "inherits",
            "inspect",
            "isArray",
            "isBoolean",
            "isBuffer",
            "isDeepStrictEqual",
            "isNull",
            "isNullOrUndefined",
            "isNumber",
            "isString",
            "isSymbol",
            "isUndefined",
            "isRegExp",
            "isObject",
            "isDate",
            "isError",
            "isFunction",
            "isPrimitive",
            "log",
            "promisify",
            "stripVTControlCharacters",
            "toUSVString",
            "TextDecoder",
            "TextEncoder",
            "types"
        ]),
        hasDefaultExport: true
    },
    "util/types": {
        namedExports: new Set([
            "isExternal",
            "isDate",
            "isArgumentsObject",
            "isBigIntObject",
            "isBooleanObject",
            "isNumberObject",
            "isStringObject",
            "isSymbolObject",
            "isNativeError",
            "isRegExp",
            "isAsyncFunction",
            "isGeneratorFunction",
            "isGeneratorObject",
            "isPromise",
            "isMap",
            "isSet",
            "isMapIterator",
            "isSetIterator",
            "isWeakMap",
            "isWeakSet",
            "isArrayBuffer",
            "isDataView",
            "isSharedArrayBuffer",
            "isProxy",
            "isModuleNamespaceObject",
            "isAnyArrayBuffer",
            "isBoxedPrimitive",
            "isArrayBufferView",
            "isTypedArray",
            "isUint8Array",
            "isUint8ClampedArray",
            "isUint16Array",
            "isUint32Array",
            "isInt8Array",
            "isInt16Array",
            "isInt32Array",
            "isFloat32Array",
            "isFloat64Array",
            "isBigInt64Array",
            "isBigUint64Array",
            "isKeyObject",
            "isCryptoKey"
        ]),
        hasDefaultExport: true
    },
    v8: {
        namedExports: new Set([
            "cachedDataVersionTag",
            "getHeapSnapshot",
            "getHeapStatistics",
            "getHeapSpaceStatistics",
            "getHeapCodeStatistics",
            "setFlagsFromString",
            "Serializer",
            "Deserializer",
            "DefaultSerializer",
            "DefaultDeserializer",
            "deserialize",
            "takeCoverage",
            "stopCoverage",
            "serialize",
            "writeHeapSnapshot",
            "promiseHooks"
        ]),
        hasDefaultExport: true
    },
    vm: {
        namedExports: new Set(["Script", "createContext", "createScript", "runInContext", "runInNewContext", "runInThisContext", "isContext", "compileFunction", "measureMemory"]),
        hasDefaultExport: true
    },
    worker_threads: {
        namedExports: new Set([
            "isMainThread",
            "MessagePort",
            "MessageChannel",
            "markAsUntransferable",
            "moveMessagePortToContext",
            "receiveMessageOnPort",
            "resourceLimits",
            "threadId",
            "SHARE_ENV",
            "Worker",
            "parentPort",
            "workerData",
            "BroadcastChannel",
            "setEnvironmentData",
            "getEnvironmentData"
        ]),
        hasDefaultExport: true
    },
    zlib: {
        namedExports: new Set([
            "Deflate",
            "Inflate",
            "Gzip",
            "Gunzip",
            "DeflateRaw",
            "InflateRaw",
            "Unzip",
            "BrotliCompress",
            "BrotliDecompress",
            "deflate",
            "deflateSync",
            "gzip",
            "gzipSync",
            "deflateRaw",
            "deflateRawSync",
            "unzip",
            "unzipSync",
            "inflate",
            "inflateSync",
            "gunzip",
            "gunzipSync",
            "inflateRaw",
            "inflateRawSync",
            "brotliCompress",
            "brotliCompressSync",
            "brotliDecompress",
            "brotliDecompressSync",
            "createDeflate",
            "createInflate",
            "createDeflateRaw",
            "createInflateRaw",
            "createGzip",
            "createGunzip",
            "createUnzip",
            "createBrotliCompress",
            "createBrotliDecompress",
            "constants",
            "codes"
        ]),
        hasDefaultExport: true
    }
};

function determineNewExtension(currentExtension) {
    switch (currentExtension) {
        case ".ts":
        case ".tsx":
        case ".d.ts":
        case ".d.mts":
        case ".js":
        case ".jsx":
        case ".cjs":
        case ".cjsx":
        case ".cts":
            return ".js";
        case ".mjs":
        case ".mts":
        case ".mjsx":
        case ".d.cts":
            return ".mjs";
        default:
            return currentExtension;
    }
}
/**
 * Converts the given module specifier to one that is supported by target runtime, based on the given context options
 */
function transformModuleSpecifier(moduleSpecifier, { context, parent, resolvedModuleSpecifier }) {
    // If the module specifier already contains an extension, do nothing else
    if (path.extname(moduleSpecifier) !== "" || resolvedModuleSpecifier == null) {
        return moduleSpecifier;
    }
    switch (context.preserveModuleSpecifiers) {
        case "always":
            return moduleSpecifier;
        case "never":
            break;
        case "external":
            if (isExternalLibrary(moduleSpecifier)) {
                return moduleSpecifier;
            }
            break;
        case "internal":
            if (!isExternalLibrary(moduleSpecifier)) {
                return moduleSpecifier;
            }
            break;
        default:
            if (context.preserveModuleSpecifiers(moduleSpecifier)) {
                return moduleSpecifier;
            }
    }
    return setExtension(ensureHasLeadingDotAndPosix(path.relative(path.dirname(parent), resolvedModuleSpecifier)), determineNewExtension(path.extname(resolvedModuleSpecifier)));
}

/**
 * Checks if the CallExpression represents a require call (e.g.: 'require(...)')
 */
function isRequireCall(inputExpression, sourceFile, context) {
    var _a;
    const { typescript } = context;
    const callExpression = walkThroughFillerNodes(inputExpression, typescript);
    if (!typescript.isCallExpression(callExpression))
        return { match: false };
    const expression = walkThroughFillerNodes(callExpression.expression, typescript);
    if (!typescript.isIdentifier(expression) || expression.text !== "require")
        return { match: false };
    // Take the first argument, if there is any
    const [firstArgument] = callExpression.arguments;
    if (firstArgument == null)
        return { match: false };
    const moduleSpecifier = typescript.isStringLiteralLike(firstArgument) ? firstArgument.text : undefined;
    const resolvedModuleSpecifier = moduleSpecifier == null
        ? undefined
        : resolvePath({
            ...context,
            id: moduleSpecifier,
            parent: sourceFile.fileName
        });
    const resolvedModuleSpecifierText = resolvedModuleSpecifier == null || isBuiltInModule(resolvedModuleSpecifier) ? undefined : (_a = context.fileSystem.safeReadFileSync(resolvedModuleSpecifier)) === null || _a === void 0 ? void 0 : _a.toString();
    if (moduleSpecifier == null || resolvedModuleSpecifier == null || resolvedModuleSpecifierText == null) {
        return {
            match: true,
            moduleSpecifier,
            transformedModuleSpecifier: moduleSpecifier,
            resolvedModuleSpecifier: undefined,
            resolvedModuleSpecifierText: undefined
        };
    }
    else {
        return {
            match: true,
            transformedModuleSpecifier: transformModuleSpecifier(moduleSpecifier, { resolvedModuleSpecifier, context, parent: sourceFile.fileName }),
            moduleSpecifier,
            resolvedModuleSpecifier,
            resolvedModuleSpecifierText
        };
    }
}

function findNodeUp(from, nodeCb, breakWhen) {
    let current = from;
    while (current.parent != null) {
        current = current.parent;
        if (breakWhen != null && breakWhen(current))
            return undefined;
        if (nodeCb(current))
            return current;
    }
    return undefined;
}

/**
 * Returns true if the given Node is a Statement
 * Uses an internal non-exposed Typescript helper to decide whether or not the Node is an Expression
 */
function isStatement(node, typescript) {
    return typescript.isStatementButNotDeclaration(node);
}

/**
 * Returns true if the given Node is a Declaration
 * Uses an internal non-exposed Typescript helper to decide whether or not the Node is an Expression
 */
function isDeclaration(node, typescript) {
    return typescript.isDeclaration(node);
}

/**
 * Returns true if the given Node is a Statement is a Declaration
 */
function isStatementOrDeclaration(node, typescript) {
    return isStatement(node, typescript) || isDeclaration(node, typescript);
}

/**
 * Generates a proper name based on the given module specifier
 */
function generateNameFromModuleSpecifier(moduleSpecifier) {
    const { name } = path.parse(moduleSpecifier);
    return camelCase(name);
}

/**
 * Tries to get or potentially parse module exports based on the given data in the given context
 */
function getModuleExportsFromRequireDataInContext(data, context) {
    if (!data.match)
        return undefined;
    const { typescript } = context;
    // Otherwise, spread out the things we know about the require call
    const { moduleSpecifier, resolvedModuleSpecifierText, resolvedModuleSpecifier } = data;
    // If no module specifier could be determined, remove the CallExpression from the SourceFile
    if (moduleSpecifier == null) {
        return undefined;
    }
    // If we've been able to resolve a module as well as its contents,
    // Check it for exports so that we know more about its internals, for example whether or not it has any named exports, etc
    let moduleExports;
    // If no module specifier could be resolved, it may be a built in module - an we may know about its module exports already
    if (resolvedModuleSpecifier == null && isBuiltInModule(moduleSpecifier)) {
        moduleExports = BUILT_IN_MODULE_MAP[moduleSpecifier];
    }
    // Otherwise, if we could resolve a module, try to get the exports for it
    else if (resolvedModuleSpecifier != null) {
        // Treat JSON modules as ones with a single default export
        if (isJsonModule(resolvedModuleSpecifier)) {
            moduleExports = {
                assert: "json",
                hasDefaultExport: true,
                namedExports: new Set()
            };
        }
        else {
            // Try to get the ModuleExports for the resolved module, if we know them already
            moduleExports = context.getModuleExportsForPath(resolvedModuleSpecifier);
            // If that wasn't possible, generate a new SourceFile and parse it
            if (moduleExports == null && resolvedModuleSpecifierText != null) {
                moduleExports = context.transformSourceFile(typescript.createSourceFile(resolvedModuleSpecifier, resolvedModuleSpecifierText, typescript.ScriptTarget.ESNext, true, typescript.ScriptKind.TS), {
                    ...context,
                    onlyExports: true
                }).exports;
            }
        }
    }
    return moduleExports;
}

function shouldDebug(debug, sourceFile) {
    if (debug == null)
        return false;
    if (typeof debug === "boolean")
        return debug;
    if (sourceFile == null)
        return true;
    if (typeof debug === "string")
        return sourceFile.fileName === debug;
    else
        return debug(sourceFile.fileName);
}

function maybeGenerateAssertClause(context, moduleSpecifier, assert) {
    if (assert == null)
        return undefined;
    const { factory, importAssertions } = context;
    if (importAssertions === false || (typeof importAssertions === "function" && !importAssertions(moduleSpecifier))) {
        return undefined;
    }
    if (!("createAssertClause" in context.typescript.factory)) {
        context.logger.warn(`The current version of TypeScript (v${context.typescript.version}) does not support Import Assertions. No Import Assertion will be added for the module with specifier '${moduleSpecifier}' in the transformed code. To remove this warning, either disable import assertions or update to TypeScript v4.5 or newer.`);
    }
    return factory.createAssertClause(factory.createNodeArray([factory.createAssertEntry(factory.createIdentifier("type"), factory.createStringLiteral(assert))]));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Split the `decorators` and `modifiers` parameters for older versions of Typescript.
 *
 * The `decorators` parameter has been removed in
 * https://github.com/microsoft/TypeScript/commit/1e65b330a71cc09065b31f1724d78e931aafed51#diff-db6fa105c495d655ffce5b52d0f5abaa1d59947ce2fa102ee023de15d15a0b80
 */
function tsFactoryDecoratorsInterop(context, func) {
    // I didn't check every Typescript version for different parameter names or different API types.
    // This solution relies on the guess that any modern use of `ModifierLike` translates
    // to `…decorators, modifiers…` parameters in older APIs and vice versa.
    const m = /^(?:function )?\w+\(((?:\s*\w\s*,)*)\s*decorators\s*,\s*modifiers\s*(?:,|\))/.exec(Function.prototype.toString.call(func));
    if (!m) {
        return func;
    }
    const position = m[1] ? m[1].split(',').length : 0;
    return function (...a) {
        const modiferLike = a[position];
        if (!modiferLike) {
            a.splice(position, 1, undefined, undefined);
        }
        else {
            const decorators = [];
            const modifiers = [];
            for (const el of modiferLike) {
                if (el.kind === context.typescript.SyntaxKind.Decorator) {
                    decorators.push(el);
                }
                else {
                    modifiers.push(el);
                }
            }
            a.splice(position, 1, decorators.length ? context.factory.createNodeArray(decorators) : undefined, modifiers.length ? context.factory.createNodeArray(modifiers) : undefined);
        }
        return func.apply(this, a);
    };
}

/**
 * Visits the given CallExpression
 */
function visitCallExpression({ node, childContinuation, sourceFile, context }) {
    if (context.onlyExports) {
        return childContinuation(node);
    }
    // Check if the node represents a require(...) call.
    const requireData = isRequireCall(node, sourceFile, context);
    const { typescript, factory } = context;
    // If it doesn't proceed without applying any transformations
    if (!requireData.match) {
        return childContinuation(node);
    }
    // Otherwise, spread out the things we know about the require call
    const { moduleSpecifier, transformedModuleSpecifier } = requireData;
    // If no module specifier could be determined, remove the CallExpression from the SourceFile
    if (moduleSpecifier == null || transformedModuleSpecifier == null) {
        return undefined;
    }
    // If we've been able to resolve a module as well as its contents,
    // Check it for exports so that we know more about its internals, for example whether or not it has any named exports, etc
    const moduleExports = getModuleExportsFromRequireDataInContext(requireData, context);
    // Find the first ExpressionStatement going up from the Node, breaking if part of a BinaryExpression, CallExpression, or a NewExpression
    const expressionStatementParent = findNodeUp(node, typescript.isExpressionStatement, currentNode => typescript.isBinaryExpression(currentNode) || typescript.isCallExpression(currentNode) || typescript.isNewExpression(currentNode));
    // If we don't know anything about the exports of the module, or if it doesn't export any named exports,
    // there's really not much we can do in terms of using the context of the CallExpression to import the maximally
    // minimal subset of the module. In these cases, the only thing that can be done is to import the default
    // export and maybe return an identifier for it depending on whether or not the CallExpression is part of an ExpressionStatement
    if (moduleExports == null || moduleExports.namedExports.size === 0 || (expressionStatementParent != null && !moduleExports.hasDefaultExport)) {
        // If part of an ExpressionStatement, simply return the module without any name or other bindings
        if (expressionStatementParent != null) {
            // Only add the import if there isn't already an import within the SourceFile of the entire module without any bindings
            if (!context.isModuleSpecifierImportedWithoutLocals(moduleSpecifier)) {
                context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, undefined, factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
            }
            // Drop this CallExpression
            return undefined;
        }
        // Otherwise, we need to give the module a name and replace the CallExpression with an identifier for it
        else {
            // If the default export is already imported, get the local binding name for it and create an identifier for it
            // rather than generating a new unnecessary import
            if (context.hasLocalForDefaultImportFromModule(moduleSpecifier)) {
                const local = context.getLocalForDefaultImportFromModule(moduleSpecifier);
                return factory.createIdentifier(local);
            }
            else {
                const identifier = factory.createIdentifier(context.getFreeIdentifier(generateNameFromModuleSpecifier(moduleSpecifier)));
                const importClause = factory.createImportClause(false, identifier, undefined);
                context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, importClause, factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
                // Replace the CallExpression by the identifier
                return identifier;
            }
        }
    }
    // Otherwise, we know that we want to add an import instead of the CallExpression, but depending on the context of the CallExpression, we may
    // or may not import specific Named Exports, the Default Export, or the entire namespace.
    // Find the first Element- or PropertyAccessExpression that wraps the require(...) call, whatever it is.
    // That means that if it is wrapped in 'require(...)["foo"].bar', then the ElementAccessExpression will be matched first
    const elementOrPropertyAccessExpressionParent = findNodeUp(node, child => typescript.isElementAccessExpression(child) || typescript.isPropertyAccessExpression(child), nextNode => isStatementOrDeclaration(nextNode, typescript));
    if (elementOrPropertyAccessExpressionParent != null) {
        // Try to evaluate the name or argument expression, depending on the kind of node
        let rightValue;
        // If it is a PropertyAccessExpression, the name will always be an identifier
        if (typescript.isPropertyAccessExpression(elementOrPropertyAccessExpressionParent)) {
            rightValue = elementOrPropertyAccessExpressionParent.name.text;
        }
        else {
            // Otherwise, the argument may be any kind of expression. Try to evaluate it to a string literal if possible
            if (typescript.isStringLiteralLike(elementOrPropertyAccessExpressionParent.argumentExpression)) {
                rightValue = elementOrPropertyAccessExpressionParent.argumentExpression.text;
            }
        }
        // The argumentExpression or name matched a string, use that as a candidate for a lookup binding
        if (rightValue != null) {
            // If the module doesn't include a named export with a name matching the right value,
            // we should instead import the default export if it has any (otherwise we'll use a Namespace import) and replace the CallExpression with an identifier for it
            if (!moduleExports.namedExports.has(rightValue)) {
                let identifier;
                // If the default export is already imported, get the local binding name for it and create an identifier for it
                // rather than generating a new unnecessary import
                if (moduleExports.hasDefaultExport && context.hasLocalForDefaultImportFromModule(moduleSpecifier)) {
                    identifier = factory.createIdentifier(context.getLocalForDefaultImportFromModule(moduleSpecifier));
                }
                // If the namespace is already imported, get the local binding name for it and create an identifier for it
                // rather than generating a new unnecessary import
                else if (!moduleExports.hasDefaultExport && context.hasLocalForNamespaceImportFromModule(moduleSpecifier)) {
                    identifier = factory.createIdentifier(context.getLocalForNamespaceImportFromModule(moduleSpecifier));
                }
                else {
                    identifier = factory.createIdentifier(context.getFreeIdentifier(generateNameFromModuleSpecifier(moduleSpecifier)));
                    context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, moduleExports.hasDefaultExport
                        ? // Import the default if it has any (or if we don't know if it has)
                            factory.createImportClause(false, identifier, undefined)
                        : // Otherwise, import the entire namespace
                            factory.createImportClause(false, undefined, factory.createNamespaceImport(identifier)), factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
                }
                // Replace the CallExpression by an ObjectLiteral that can be accessed by the wrapping Element- or PropertyAccessExpression
                const objectLiteralProperties = [
                    identifier.text !== rightValue
                        ? factory.createPropertyAssignment(rightValue, factory.createIdentifier(identifier.text))
                        : factory.createShorthandPropertyAssignment(factory.createIdentifier(identifier.text))
                ];
                return factory.createObjectLiteralExpression(objectLiteralProperties);
            }
            // Otherwise, use the right value as the ImportSpecifier for a new import.
            // Depending on the placement of the CallExpression, we may or may not need to
            // replace it with an identifier or remove it entirely in favor of the ImportDeclaration
            else {
                // The property to import will be equal to the right value
                const importBindingPropertyName = rightValue;
                let importBindingName;
                // If the default export is already imported, get the local binding name for it and create an identifier for it
                // rather than generating a new unnecessary import
                if (context.hasLocalForNamedImportPropertyNameFromModule(importBindingPropertyName, moduleSpecifier)) {
                    importBindingName = context.getLocalForNamedImportPropertyNameFromModule(importBindingPropertyName, moduleSpecifier);
                }
                // If the namespace is already imported, get the local binding name for it and create an identifier for it
                // rather than generating a new unnecessary import
                else if (!moduleExports.hasDefaultExport && context.hasLocalForNamespaceImportFromModule(moduleSpecifier)) {
                    importBindingName = context.getLocalForNamespaceImportFromModule(moduleSpecifier);
                }
                else {
                    // If that binding isn't free within the context, import it as another local name
                    importBindingName = context.getFreeIdentifier(importBindingPropertyName);
                    const namedImports = factory.createNamedImports([
                        importBindingPropertyName === importBindingName
                            ? // If the property name is free within the context, don't alias the import
                                factory.createImportSpecifier(false, undefined, factory.createIdentifier(importBindingPropertyName))
                            : // Otherwise, import it aliased by another name that is free within the context
                                factory.createImportSpecifier(false, factory.createIdentifier(importBindingPropertyName), factory.createIdentifier(importBindingName))
                    ]);
                    const importClause = factory.createImportClause(false, undefined, namedImports);
                    context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, importClause, factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
                }
                // If the 'require(...)[<something>]' or 'require(...).<something>' expression is part of an ExpressionStatement
                // and isn't part of another expression such as a BinaryExpression, only preserve the import.
                // Otherwise leave an ObjectLiteral that can be accessed by the wrapping Element- or PropertyAccessExpression
                if (expressionStatementParent == null) {
                    const objectLiteralProperties = [
                        importBindingName !== rightValue
                            ? factory.createPropertyAssignment(rightValue, factory.createIdentifier(importBindingName))
                            : factory.createShorthandPropertyAssignment(factory.createIdentifier(importBindingName))
                    ];
                    return factory.createObjectLiteralExpression(objectLiteralProperties);
                }
                else {
                    return undefined;
                }
            }
        }
    }
    // If no lookup binding candidate has been determined, it may be determined based on the parent VariableDeclaration,
    // if there is any.
    // Find the first VariableDeclaration that holds the require(...) call, if any.
    // For example, 'const foo = require(...)' would match the VariableDeclaration for 'foo'
    const variableDeclarationParent = findNodeUp(node, typescript.isVariableDeclaration, nextNode => isStatement(nextNode, typescript));
    if (variableDeclarationParent != null) {
        // If the VariableDeclaration is simply bound to a name, it doesn't tell us anything interesting.
        // Simply add an import for the default export - if it has any (otherwise we'll import the entire namespace), and
        // replace this CallExpression by an identifier for it
        if (typescript.isIdentifier(variableDeclarationParent.name)) {
            // If the default export is already imported, get the local binding name for it and create an identifier for it
            // rather than generating a new unnecessary import
            if (moduleExports.hasDefaultExport && context.hasLocalForDefaultImportFromModule(moduleSpecifier)) {
                const local = context.getLocalForDefaultImportFromModule(moduleSpecifier);
                return factory.createIdentifier(local);
            }
            // If the namespace is already imported, get the local binding name for it and create an identifier for it
            // rather than generating a new unnecessary import
            else if (!moduleExports.hasDefaultExport && context.hasLocalForNamespaceImportFromModule(moduleSpecifier)) {
                const local = context.getLocalForNamespaceImportFromModule(moduleSpecifier);
                return factory.createIdentifier(local);
            }
            // Otherwise proceed as planned
            else {
                const identifier = factory.createIdentifier(context.getFreeIdentifier(generateNameFromModuleSpecifier(moduleSpecifier)));
                context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, moduleExports.hasDefaultExport
                    ? // Import the default if it has any (or if we don't know if it has)
                        factory.createImportClause(false, identifier, undefined)
                    : // Otherwise, import the entire namespace
                        factory.createImportClause(false, undefined, factory.createNamespaceImport(identifier)), factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
                return identifier;
            }
        }
        // If the VariableDeclaration is a BindingPattern, it may mimic destructuring specific named exports.
        // For example, 'const {foo, bar} = require("./bar")' could import the named export bindings 'foo' and 'bar' from the module './bar'.
        // However, if as much as a single one of these elements don't directly match a named export, opt out of this behavior and instead
        // import the default export (if it has any, otherwise import the entire namespace).
        else if (typescript.isObjectBindingPattern(variableDeclarationParent.name)) {
            const importSpecifiers = [];
            const skippedImportSpecifiers = [];
            // Check each of the BindingElements
            for (const element of variableDeclarationParent.name.elements) {
                // If the property name isn't given, the name will always be an Identifier
                if (element.propertyName == null && typescript.isIdentifier(element.name)) {
                    // If the module exports contains a named export matching the identifier name,
                    // use that as an ImportSpecifier
                    if (moduleExports.namedExports.has(element.name.text)) {
                        // If the property has already been imported, don't add an import, but instead push to 'skippedImportSpecifiers'.
                        if (context.hasLocalForNamedImportPropertyNameFromModule(element.name.text, moduleSpecifier)) {
                            const local = context.getLocalForNamedImportPropertyNameFromModule(element.name.text, moduleSpecifier);
                            skippedImportSpecifiers.push(local === element.name.text
                                ? factory.createImportSpecifier(false, undefined, factory.createIdentifier(local))
                                : factory.createImportSpecifier(false, factory.createIdentifier(element.name.text), factory.createIdentifier(local)));
                        }
                        // If the name is free, just import it as it is
                        else if (context.isIdentifierFree(element.name.text)) {
                            context.addLocal(element.name.text);
                            importSpecifiers.push(factory.createImportSpecifier(false, undefined, factory.createIdentifier(element.name.text)));
                        }
                        else {
                            // Otherwise, import it under an aliased name
                            const alias = context.getFreeIdentifier(element.name.text);
                            importSpecifiers.push(factory.createImportSpecifier(false, factory.createIdentifier(element.name.text), factory.createIdentifier(alias)));
                        }
                    }
                }
                // Otherwise, if it has a PropertyName,
                // It may be something like for example: '{foo: bar}' where 'foo' is the PropertyName and 'bar' is the name.
                // Of course it can get wilder than that, but for it to mimic ESM, we'll use at most the '{<propertyName>: <name>}' form
                // and preserve the remaining BindingName.
                // Since the ':bar' assignment comes from the VariableDeclaration that surrounds this CallExpression, we'll only
                // need to import the actual named export without considering the alias
                else if (element.propertyName != null && typescript.isIdentifier(element.propertyName)) {
                    // If the name is free, just import it as it is
                    if (context.isIdentifierFree(element.propertyName.text)) {
                        context.addLocal(element.propertyName.text);
                        importSpecifiers.push(factory.createImportSpecifier(false, undefined, factory.createIdentifier(element.propertyName.text)));
                    }
                    else {
                        const alias = context.getFreeIdentifier(element.propertyName.text);
                        importSpecifiers.push(factory.createImportSpecifier(false, factory.createIdentifier(element.propertyName.text), factory.createIdentifier(alias)));
                    }
                }
            }
            // If there aren't as many ImportSpecifiers as there are elements, opt out of this behavior and instead
            // import the default export (if it has any, otherwise import the entire namespace).
            if (importSpecifiers.length + skippedImportSpecifiers.length !== variableDeclarationParent.name.elements.length) {
                // If the default export is already imported, get the local binding name for it and create an identifier for it
                // rather than generating a new unnecessary import
                if (moduleExports.hasDefaultExport && context.hasLocalForDefaultImportFromModule(moduleSpecifier)) {
                    const local = context.getLocalForDefaultImportFromModule(moduleSpecifier);
                    return factory.createIdentifier(local);
                }
                // If the namespace is already imported, get the local binding name for it and create an identifier for it
                // rather than generating a new unnecessary import
                else if (!moduleExports.hasDefaultExport && context.hasLocalForNamespaceImportFromModule(moduleSpecifier)) {
                    const local = context.getLocalForNamespaceImportFromModule(moduleSpecifier);
                    return factory.createIdentifier(local);
                }
                // Otherwise proceed as planned
                else {
                    const identifier = factory.createIdentifier(context.getFreeIdentifier(generateNameFromModuleSpecifier(moduleSpecifier)));
                    context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, moduleExports.hasDefaultExport
                        ? // Import the default if it has any (or if we don't know if it has)
                            factory.createImportClause(false, identifier, undefined)
                        : // Otherwise, import the entire namespace
                            factory.createImportClause(false, undefined, factory.createNamespaceImport(identifier)), factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
                    return identifier;
                }
            }
            // Otherwise, add an import for those specific, optionally aliased, named exports
            // and then replace this CallExpression with an Object literal that can be destructured
            else {
                if (importSpecifiers.length > 0) {
                    context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, factory.createImportClause(false, undefined, factory.createNamedImports(importSpecifiers)), factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
                }
                const objectLiteralProperties = [...importSpecifiers, ...skippedImportSpecifiers].map(specifier => specifier.propertyName != null
                    ? factory.createPropertyAssignment(specifier.propertyName.text, factory.createIdentifier(specifier.name.text))
                    : factory.createShorthandPropertyAssignment(factory.createIdentifier(specifier.name.text)));
                return factory.createObjectLiteralExpression(objectLiteralProperties);
            }
        }
    }
    // Find the first BinaryExpression with an equals token that holds the require(...) call on the right side, and a PropertyAccessExpression or ElementAccessExpression on the left side, if any.
    // For example, 'exports.foo = require(...)'
    const binaryExpressionParent = findNodeUp(node, typescript.isBinaryExpression, nextNode => isStatement(nextNode, typescript));
    if (binaryExpressionParent != null &&
        binaryExpressionParent.operatorToken.kind === typescript.SyntaxKind.EqualsToken &&
        (typescript.isPropertyAccessExpression(walkThroughFillerNodes(binaryExpressionParent.left, typescript)) ||
            typescript.isElementAccessExpression(walkThroughFillerNodes(binaryExpressionParent.left, typescript)))) {
        // Simply add an import for the default export - if it has any (otherwise we'll import the entire namespace), and
        // replace this CallExpression by an identifier for it
        // If the default export is already imported, get the local binding name for it and create an identifier for it
        // rather than generating a new unnecessary import
        if (moduleExports.hasDefaultExport && context.hasLocalForDefaultImportFromModule(moduleSpecifier)) {
            const local = context.getLocalForDefaultImportFromModule(moduleSpecifier);
            return factory.createIdentifier(local);
        }
        // If the namespace is already imported, get the local binding name for it and create an identifier for it
        // rather than generating a new unnecessary import
        else if (!moduleExports.hasDefaultExport && context.hasLocalForNamespaceImportFromModule(moduleSpecifier)) {
            const local = context.getLocalForNamespaceImportFromModule(moduleSpecifier);
            return factory.createIdentifier(local);
        }
        // Otherwise proceed as planned
        else {
            const identifier = factory.createIdentifier(context.getFreeIdentifier(generateNameFromModuleSpecifier(moduleSpecifier)));
            context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, moduleExports.hasDefaultExport
                ? // Import the default if it has any (or if we don't know if it has)
                    factory.createImportClause(false, identifier, undefined)
                : // Otherwise, import the entire namespace
                    factory.createImportClause(false, undefined, factory.createNamespaceImport(identifier)), factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
            return identifier;
        }
    }
    // Otherwise, check if the require(...) call is part of another CallExpression.
    // For example: 'myFunction(require(...)' or 'require(...)(...)'
    const callExpressionParent = findNodeUp(node, typescript.isCallExpression, nextNode => isStatementOrDeclaration(nextNode, typescript));
    // If it is wrapped in a CallExpression, import the default export if it has any (otherwise the entire namespace)
    // and replace the require() call by an identifier for it
    if (callExpressionParent != null) {
        // If the default export is already imported, get the local binding name for it and create an identifier for it
        // rather than generating a new unnecessary import
        if (moduleExports.hasDefaultExport && context.hasLocalForDefaultImportFromModule(moduleSpecifier)) {
            const local = context.getLocalForDefaultImportFromModule(moduleSpecifier);
            return factory.createIdentifier(local);
        }
        // If the namespace is already imported, get the local binding name for it and create an identifier for it
        // rather than generating a new unnecessary import
        else if (!moduleExports.hasDefaultExport && context.hasLocalForNamespaceImportFromModule(moduleSpecifier)) {
            const local = context.getLocalForNamespaceImportFromModule(moduleSpecifier);
            return factory.createIdentifier(local);
        }
        // Otherwise, proceed as planned
        else {
            const identifier = factory.createIdentifier(context.getFreeIdentifier(generateNameFromModuleSpecifier(moduleSpecifier)));
            context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, moduleExports.hasDefaultExport
                ? // Import the default if it has any (or if we don't know if it has)
                    factory.createImportClause(false, identifier, undefined)
                : // Otherwise, import the entire namespace
                    factory.createImportClause(false, undefined, factory.createNamespaceImport(identifier)), factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
            return identifier;
        }
    }
    if (shouldDebug(context.debug)) {
        throw new TypeError(`Could not handle require() call`);
    }
    else {
        return node;
    }
}

function getExportsData(expression, exportsName = "exports", typescript) {
    expression = walkThroughFillerNodes(expression, typescript);
    if (typescript.isIdentifier(expression)) {
        if (expression.text === exportsName) {
            return {};
        }
        else {
            return undefined;
        }
    }
    else if (typescript.isPropertyAccessExpression(expression)) {
        const left = walkThroughFillerNodes(expression.expression, typescript);
        const right = expression.name;
        // If the left-hand side is an identifier, it may be something like 'module.exports',
        // but it may also be something completely unrelated such as 'foo.bar'
        if (typescript.isIdentifier(left)) {
            if (left.text === "module" && right.text === exportsName) {
                return {};
            }
            // This will be something like 'exports.foo'
            else if (left.text === exportsName) {
                return {
                    property: right.text
                };
            }
            // This will be something completely unrelated
            else {
                return undefined;
            }
        }
        else {
            // Otherwise, check if the left-hand side leads to exports data
            const leftData = getExportsData(left, exportsName, typescript);
            if (leftData == null) {
                return undefined;
            }
            // If it does, this is something like 'module.exports.foo'
            else {
                return {
                    ...leftData,
                    property: right.text
                };
            }
        }
    }
    else if (typescript.isElementAccessExpression(expression)) {
        const left = walkThroughFillerNodes(expression.expression, typescript);
        const right = walkThroughFillerNodes(expression.argumentExpression, typescript);
        // If the argument expression is something that isn't statically analyzable, skip it
        if (!typescript.isStringLiteralLike(right))
            return undefined;
        // If the left-hand side is an identifier, it may be something like 'module.exports',
        // but it may also be something completely unrelated such as 'foo.bar'
        if (typescript.isIdentifier(left)) {
            if (left.text === "module" && right.text === exportsName) {
                return {};
            }
            // This will be something like 'exports.foo'
            else if (left.text === exportsName) {
                return {
                    property: right.text
                };
            }
            // This will be something completely unrelated
            else {
                return undefined;
            }
        }
        else {
            // Otherwise, check if the left-hand side leads to exports data
            const leftData = getExportsData(left, exportsName, typescript);
            if (leftData == null) {
                return undefined;
            }
            // If it does, this is something like 'module.exports.foo'
            else {
                return {
                    ...leftData,
                    property: right.text
                };
            }
        }
    }
    else {
        return undefined;
    }
}

function isNamedDeclaration(node, typescript) {
    if (typescript.isPropertyAccessExpression(node))
        return false;
    return "name" in node && node.name != null;
}

function ensureNodeHasExportModifier(node, context) {
    var _a, _b;
    const existingModifierKinds = node.modifiers == null ? [] : node.modifiers.map(m => m.kind);
    const { typescript, factory } = context;
    const declarationName = typescript.getNameOfDeclaration(node);
    if (declarationName != null && typescript.isIdentifier(declarationName)) {
        // If the declaration name is part of the exports of the SourceFile, return the node as it is
        if (context.isLocalExported(declarationName.text)) {
            return node;
        }
        context.markLocalAsExported(declarationName.text);
    }
    // If the node already has an Export modifier, there's nothing to do
    if (existingModifierKinds.includes(typescript.SyntaxKind.ExportKeyword)) {
        return node;
    }
    const newModifiers = [
        ...((_a = node.decorators) !== null && _a !== void 0 ? _a : []),
        factory.createModifier(typescript.SyntaxKind.ExportKeyword),
        ...((_b = node.modifiers) !== null && _b !== void 0 ? _b : []),
    ];
    if (typescript.isFunctionDeclaration(node)) {
        return tsFactoryDecoratorsInterop(context, factory.updateFunctionDeclaration)(node, newModifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body);
    }
    else if (typescript.isFunctionExpression(node)) {
        return factory.updateFunctionExpression(node, newModifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body);
    }
    else if (typescript.isClassDeclaration(node)) {
        return tsFactoryDecoratorsInterop(context, factory.updateClassDeclaration)(node, newModifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
    }
    else if (typescript.isClassExpression(node)) {
        return tsFactoryDecoratorsInterop(context, factory.updateClassExpression)(node, newModifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
    }
    else if (typescript.isVariableStatement(node)) {
        return tsFactoryDecoratorsInterop(context, factory.updateVariableStatement)(node, newModifiers, node.declarationList);
    }
    else if (typescript.isEnumDeclaration(node)) {
        return tsFactoryDecoratorsInterop(context, factory.updateEnumDeclaration)(node, newModifiers, node.name, node.members);
    }
    else if (typescript.isInterfaceDeclaration(node)) {
        return tsFactoryDecoratorsInterop(context, factory.updateInterfaceDeclaration)(node, newModifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
    }
    else if (typescript.isTypeAliasDeclaration(node)) {
        return tsFactoryDecoratorsInterop(context, factory.updateTypeAliasDeclaration)(node, newModifiers, node.name, node.typeParameters, node.type);
    }
    // Only throw if debugging is active
    else if (shouldDebug(context.debug)) {
        throw new TypeError(`Could not handle Node of kind: ${typescript.SyntaxKind[node.kind]}`);
    }
    else {
        return node;
    }
}

function nodeContainsSuper(node, typescript) {
    if (node.kind === typescript.SyntaxKind.ThisKeyword)
        return true;
    return typescript.forEachChild(node, nextNode => nodeContainsSuper(nextNode, typescript)) === true;
}

function addExportModifier(modifiers, context) {
    const { factory, typescript } = context;
    if (!modifiers) {
        modifiers = factory.createNodeArray();
    }
    else if (modifiers.some(m => m.kind === typescript.SyntaxKind.ExportKeyword)) {
        return modifiers;
    }
    return factory.createNodeArray([
        factory.createModifier(typescript.SyntaxKind.ExportKeyword),
        ...modifiers.map(m => (m.kind === typescript.SyntaxKind.Decorator
            ? factory.createDecorator(m.expression)
            : factory.createModifier(m.kind)))
    ]);
}

/**
 * Returns true if the given Node is an Expression.
 * Uses an internal non-exposed Typescript helper to decide whether or not the Node is an Expression
 */
function isExpression(node, typescript) {
    try {
        return typescript.isExpressionNode(node) || typescript.isIdentifier(node);
    }
    catch {
        return false;
    }
}

function getLocalsForBindingName(name, typescript) {
    if (typescript.isIdentifier(name)) {
        return [name.text];
    }
    else if (typescript.isObjectBindingPattern(name)) {
        const locals = [];
        for (const element of name.elements) {
            locals.push(...getLocalsForBindingName(element.name, typescript));
        }
        return locals;
    }
    else {
        const locals = [];
        for (const element of name.elements) {
            if (typescript.isOmittedExpression(element))
                continue;
            locals.push(...getLocalsForBindingName(element.name, typescript));
        }
        return locals;
    }
}

function isNodeArray(t) {
    return Array.isArray(t);
}

/**
 * Visits the given BinaryExpression
 */
function visitBinaryExpression({ node, sourceFile, context, continuation }) {
    var _a;
    // Check if the left-hand side contains exports. For example: 'exports = ...' or 'exports.foo = 1' or event 'module.exports = 1'
    const { typescript, factory } = context;
    const exportsData = getExportsData(node.left, context.exportsName, typescript);
    const right = walkThroughFillerNodes(node.right, typescript);
    if (exportsData == null)
        return node;
    // If it is an assignment
    if (node.operatorToken.kind === typescript.SyntaxKind.EqualsToken) {
        // Check if this expression is part of a VariableDeclaration.
        // For example: 'const foo = module.exports = ...'
        const variableDeclarationParent = findNodeUp(node, typescript.isVariableDeclaration);
        const variableDeclarationLocal = variableDeclarationParent != null ? factory.createIdentifier(getLocalsForBindingName(variableDeclarationParent.name, typescript)[0]) : undefined;
        // This is something like for example 'exports = ...', 'module.exports = ...', 'exports.default', or 'module.exports.default'
        if (exportsData.property == null || exportsData.property === "default") {
            // Take all individual key-value pairs of that ObjectLiteral
            // and turn them into named exports if possible.
            // Also generate a default export of the entire exports object
            if (typescript.isObjectLiteralExpression(right)) {
                // If it has no properties, or if the literal is exported as part of the right-hand side of the assignment for a VariableDeclaration, create a simple default export declaration
                if (right.properties.length === 0 || variableDeclarationLocal != null) {
                    const continuationResult = continuation(node.right);
                    if (continuationResult == null || isNodeArray(continuationResult) || !isExpression(continuationResult, typescript)) {
                        return undefined;
                    }
                    const exportedSymbol = variableDeclarationLocal != null ? variableDeclarationLocal : continuationResult;
                    // Only generate the default export if the module don't already include a default export
                    if (!context.isDefaultExported) {
                        context.markDefaultAsExported();
                        context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportAssignment)(undefined, false, exportedSymbol));
                    }
                    return variableDeclarationParent != null ? node.right : undefined;
                }
                const statements = [];
                let moduleExportsIdentifierName;
                const elements = [];
                for (const property of right.properties) {
                    const propertyName = property.name == null
                        ? undefined
                        : typescript.isLiteralExpression(property.name) || typescript.isIdentifier(property.name) || typescript.isPrivateIdentifier(property.name)
                            ? property.name.text
                            : typescript.isLiteralExpression(property.name.expression)
                                ? property.name.expression.text
                                : undefined;
                    // If no property name could be decided, or if the local is already exported, or if it is a setter, skip this property
                    if (propertyName == null || typescript.isSetAccessorDeclaration(property) || typescript.isGetAccessorDeclaration(property) || context.isLocalExported(propertyName)) {
                        elements.push(property);
                        continue;
                    }
                    // If it is a Shorthand Property assignment, we know that it holds a reference to some root-level identifier.
                    // Based on this knowledge, we can safely generate a proper ExportDeclaration for it
                    if (typescript.isShorthandPropertyAssignment(property)) {
                        context.markLocalAsExported(propertyName);
                        elements.push(factory.createShorthandPropertyAssignment(propertyName, property.objectAssignmentInitializer));
                        const namedExports = factory.createNamedExports([factory.createExportSpecifier(false, undefined, propertyName)]);
                        statements.push(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, namedExports, undefined));
                    }
                    // If it is a PropertyAssignment that points to an Identifier, we know that it holds a reference to some root-level identifier.
                    // Based on this knowledge, we can safely generate a proper ExportDeclaration for it
                    else if (typescript.isPropertyAssignment(property) && typescript.isIdentifier(property.initializer)) {
                        context.markLocalAsExported(propertyName);
                        elements.push(factory.createPropertyAssignment(propertyName, factory.createIdentifier(property.initializer.text)));
                        const namedExports = factory.createNamedExports([
                            propertyName === property.initializer.text
                                ? factory.createExportSpecifier(false, undefined, propertyName)
                                : factory.createExportSpecifier(false, property.initializer.text, propertyName)
                        ]);
                        statements.push(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, namedExports, undefined));
                    }
                    else if (context.isIdentifierFree(propertyName) && typescript.isPropertyAssignment(property) && !nodeContainsSuper(property.initializer, typescript)) {
                        context.addLocal(propertyName);
                        elements.push(factory.createShorthandPropertyAssignment(propertyName));
                        statements.push(factory.createVariableStatement([factory.createModifier(typescript.SyntaxKind.ExportKeyword)], factory.createVariableDeclarationList([factory.createVariableDeclaration(propertyName, undefined, undefined, property.initializer)], typescript.NodeFlags.Const)));
                    }
                    // If it is a MethodDeclaration that can be safely rewritten to a function, do so
                    else if (context.isIdentifierFree(propertyName) &&
                        typescript.isMethodDeclaration(property) &&
                        typescript.isIdentifier(property.name) &&
                        !nodeContainsSuper(property, typescript)) {
                        context.addLocal(propertyName);
                        elements.push(factory.createShorthandPropertyAssignment(propertyName));
                        statements.push(tsFactoryDecoratorsInterop(context, factory.createFunctionDeclaration)([
                            ...((_a = property.decorators) !== null && _a !== void 0 ? _a : []),
                            ...addExportModifier(property.modifiers, context),
                        ], property.asteriskToken, property.name, property.typeParameters, property.parameters, property.type, property.body));
                    }
                    // Otherwise, so long as the identifier of the property is free, generate a VariableStatement that exports
                    // the binding as a named export
                    else if (context.isIdentifierFree(propertyName)) {
                        context.addLocal(propertyName);
                        elements.push(property);
                        if (moduleExportsIdentifierName == null) {
                            moduleExportsIdentifierName = context.getFreeIdentifier("moduleExports");
                        }
                        context.markLocalAsExported(propertyName);
                        statements.push(factory.createVariableStatement([factory.createModifier(typescript.SyntaxKind.ExportKeyword)], factory.createVariableDeclarationList([
                            factory.createVariableDeclaration(propertyName, undefined, undefined, factory.createPropertyAccessExpression(factory.createIdentifier(moduleExportsIdentifierName), propertyName))
                        ], typescript.NodeFlags.Const)));
                    }
                    else {
                        elements.push(property);
                    }
                }
                // If we need the default export the have a name such that it can be referenced in a later named export,
                // create a VariableStatement as well as an ExportAssignment that references it
                if (moduleExportsIdentifierName != null) {
                    // Create a VariableStatement that exports the ObjectLiteral
                    statements.push(factory.createVariableStatement(undefined, factory.createVariableDeclarationList([factory.createVariableDeclaration(moduleExportsIdentifierName, undefined, undefined, factory.createObjectLiteralExpression(elements, true))], typescript.NodeFlags.Const)));
                    if (!context.isDefaultExported) {
                        statements.push(tsFactoryDecoratorsInterop(context, factory.createExportAssignment)(undefined, false, factory.createIdentifier(moduleExportsIdentifierName)));
                        context.markDefaultAsExported();
                    }
                }
                // Otherwise, we don't need to assign it to a VariableStatement. Instead, we can just provide the ObjectLiteralExpression to the ExportAssignment directly.
                else if (!context.isDefaultExported) {
                    const defaultExportInitializer = factory.createObjectLiteralExpression(elements, true);
                    statements.push(tsFactoryDecoratorsInterop(context, factory.createExportAssignment)(undefined, false, defaultExportInitializer));
                }
                // Return all of the statements
                context.addTrailingStatements(...statements);
                return undefined;
            }
            // Convert it into an ExportAssignment instead if possible
            else {
                // Check if the rightvalue represents a require(...) call.
                const requireData = isRequireCall(node.right, sourceFile, context);
                // If it doesn't, export the right side
                if (!requireData.match) {
                    if (!context.isDefaultExported) {
                        context.markDefaultAsExported();
                        const continuationResult = continuation(node.right);
                        if (continuationResult == null || isNodeArray(continuationResult) || !isExpression(continuationResult, typescript)) {
                            return undefined;
                        }
                        else {
                            const replacementNode = variableDeclarationParent != null ? continuationResult : undefined;
                            const exportedSymbol = variableDeclarationLocal != null ? variableDeclarationLocal : continuationResult;
                            context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportAssignment)(undefined, false, exportedSymbol));
                            return replacementNode;
                        }
                    }
                    return undefined;
                }
                // Otherwise, spread out the things we know about the require call
                const { transformedModuleSpecifier } = requireData;
                // If no module specifier could be determined, there's nothing we can do
                if (transformedModuleSpecifier == null) {
                    if (shouldDebug(context.debug)) {
                        throw new TypeError(`Could not handle re-export from require() call. The module specifier wasn't statically analyzable`);
                    }
                    else {
                        return undefined;
                    }
                }
                // Otherwise, take the exports from that module
                else {
                    const moduleExports = getModuleExportsFromRequireDataInContext(requireData, context);
                    const moduleSpecifierExpression = factory.createStringLiteral(transformedModuleSpecifier);
                    // If the module has a default export, or if we know nothing about it,
                    // export the default export from that module
                    if (!context.isDefaultExported && (moduleExports == null || moduleExports.hasDefaultExport)) {
                        context.markDefaultAsExported();
                        const namedExports = factory.createNamedExports([factory.createExportSpecifier(false, undefined, "default")]);
                        context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, namedExports, moduleSpecifierExpression));
                        return undefined;
                    }
                    // Otherwise, export the entire module (e.g. all named exports)
                    else {
                        context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, undefined, moduleSpecifierExpression));
                        return undefined;
                    }
                }
            }
        }
        // If this is part of a VariableDeclaration, such as for 'const foo = exports.bar = ...', it should be translated into:
        // const foo = ...;
        // export {foo as bar}
        else if (variableDeclarationLocal != null) {
            const local = exportsData.property;
            const continuationResult = continuation(node.right);
            if (continuationResult == null || isNodeArray(continuationResult) || (!isExpression(continuationResult, typescript) && !typescript.isIdentifier(continuationResult))) {
                return undefined;
            }
            const namedExports = factory.createNamedExports([
                local === variableDeclarationLocal.text
                    ? factory.createExportSpecifier(false, undefined, factory.createIdentifier(local))
                    : factory.createExportSpecifier(false, variableDeclarationLocal.text, factory.createIdentifier(local))
            ]);
            context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, namedExports));
            return continuationResult;
        }
        // If the right-hand side is an identifier, this can safely be converted into an ExportDeclaration
        // such as 'export {foo}'
        else if (typescript.isIdentifier(right)) {
            const local = exportsData.property;
            if (!context.isLocalExported(local)) {
                const namedExports = factory.createNamedExports([
                    local === right.text
                        ? factory.createExportSpecifier(false, undefined, factory.createIdentifier(local))
                        : factory.createExportSpecifier(false, right.text, factory.createIdentifier(local))
                ]);
                context.markLocalAsExported(local);
                context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, namedExports));
            }
            return undefined;
        }
        // Otherwise, this is something like 'exports.foo = function foo () {}'
        else if (isNamedDeclaration(right, typescript) && right.name != null && typescript.isIdentifier(right.name) && exportsData.property === right.name.text) {
            context.addTrailingStatements(ensureNodeHasExportModifier(right, context));
            return undefined;
        }
        // Otherwise, this can be converted into a VariableStatement
        else {
            const continuationResult = continuation(node.right);
            if (continuationResult == null || isNodeArray(continuationResult)) {
                return undefined;
            }
            if (!context.isLocalExported(exportsData.property)) {
                context.markLocalAsExported(exportsData.property);
                if (typescript.isIdentifier(continuationResult)) {
                    const namedExports = factory.createNamedExports([
                        continuationResult.text === exportsData.property
                            ? factory.createExportSpecifier(false, undefined, factory.createIdentifier(exportsData.property))
                            : factory.createExportSpecifier(false, factory.createIdentifier(continuationResult.text), factory.createIdentifier(exportsData.property))
                    ]);
                    context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, namedExports, undefined));
                }
                else {
                    const freeIdentifier = context.getFreeIdentifier(exportsData.property);
                    // If it is free, we can simply add an export modifier in front of the expression
                    if (freeIdentifier === exportsData.property) {
                        context.addTrailingStatements(factory.createVariableStatement([factory.createModifier(typescript.SyntaxKind.ExportKeyword)], factory.createVariableDeclarationList([factory.createVariableDeclaration(exportsData.property, undefined, undefined, continuationResult)], typescript.NodeFlags.Const)));
                    }
                    else {
                        const namedExports = factory.createNamedExports([factory.createExportSpecifier(false, freeIdentifier, exportsData.property)]);
                        // If it isn't, we'll need to bind it to a variable with the free name, but then export it under the original one
                        context.addTrailingStatements(factory.createVariableStatement(undefined, factory.createVariableDeclarationList([factory.createVariableDeclaration(freeIdentifier, undefined, undefined, continuationResult)], typescript.NodeFlags.Const)), tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, namedExports, undefined));
                    }
                }
            }
            return undefined;
        }
    }
    return node;
}

function willReassignIdentifier(identifier, node, typescript) {
    const result = typescript.forEachChild(node, nextNode => {
        // If it is an assignment to the given identifier
        if (typescript.isBinaryExpression(nextNode) &&
            nextNode.operatorToken.kind === typescript.SyntaxKind.EqualsToken &&
            typescript.isIdentifier(nextNode.left) &&
            nextNode.left.text === identifier) {
            return true;
        }
        if (willReassignIdentifier(identifier, nextNode, typescript)) {
            return true;
        }
        return;
    });
    return result != null ? result : false;
}

function hasModifier(node, modifier) {
    const nodeModifiers = node.modifiers;
    return !!nodeModifiers && nodeModifiers.some(m => m.kind === modifier);
}

function hasExportModifier(node, typescript) {
    return hasModifier(node, typescript.SyntaxKind.ExportKeyword);
}

/**
 * Visits the given VariableDeclaration
 */
function visitVariableDeclaration({ node, childContinuation, sourceFile, context }) {
    var _a;
    if (context.onlyExports || node.initializer == null) {
        return childContinuation(node);
    }
    const { typescript, factory } = context;
    // Most sophisticated require(...) handling comes from the CallExpression visitor, but this Visitor is for rewriting simple
    // 'foo = require("bar")' or '{foo} = require("bar")' as well as '{foo: bar} = require("bar")' expressions
    const initializer = walkThroughFillerNodes(node.initializer, typescript);
    const statement = findNodeUp(node, typescript.isVariableStatement, n => typescript.isBlock(n) || typescript.isSourceFile(n));
    if (!typescript.isCallExpression(initializer)) {
        return childContinuation(node);
    }
    // Check if the initializer represents a require(...) call.
    const requireData = isRequireCall(initializer, sourceFile, context);
    // If it doesn't, proceed without applying any transformations
    if (!requireData.match) {
        return childContinuation(node);
    }
    // Otherwise, spread out the things we know about the require call
    const { moduleSpecifier, transformedModuleSpecifier } = requireData;
    // If no module specifier could be determined, proceed with the child continuation
    if (moduleSpecifier == null || transformedModuleSpecifier == null) {
        return childContinuation(node);
    }
    // If we've been able to resolve a module as well as its contents,
    // Check it for exports so that we know more about its internals, for example whether or not it has any named exports, etc
    const moduleExports = getModuleExportsFromRequireDataInContext(requireData, context);
    // This will be something like 'foo = require("bar")
    if (typescript.isIdentifier(node.name)) {
        // If the default export is already imported under the same local name as this VariableDeclaration binds,
        // proceed from the child continuation for more sophisticated behavior
        if ((moduleExports == null || moduleExports.hasDefaultExport) && context.hasLocalForDefaultImportFromModule(moduleSpecifier)) {
            return childContinuation(node);
        }
        // If the namespace is already imported, under the same local name as this VariableDeclaration binds,
        // proceed from the child continuation for more sophisticated behavior
        else if (moduleExports != null && !moduleExports.hasDefaultExport && context.hasLocalForNamespaceImportFromModule(moduleSpecifier)) {
            return childContinuation(node);
        }
        // Otherwise, the 'foo = require("bar")' VariableDeclaration is part of an Exported VariableStatement such as 'export const foo = require("bar")',
        // and it should preferably be converted into an ExportDeclaration
        else if (statement != null && hasExportModifier(statement, typescript)) {
            const moduleSpecifierExpression = factory.createStringLiteral(transformedModuleSpecifier);
            if (moduleExports == null || moduleExports.hasDefaultExport) {
                const exportClause = factory.createNamedExports([
                    factory.createExportSpecifier(false, node.name.text === "default" ? undefined : factory.createIdentifier("default"), factory.createIdentifier(node.name.text))
                ]);
                context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, exportClause, moduleSpecifierExpression));
                return undefined;
            }
            // Otherwise, if the TypeScript version supports named namespace exports
            else if (factory.createNamespaceExport != null) {
                const exportClause = factory.createNamespaceExport(factory.createIdentifier(node.name.text));
                context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, exportClause, moduleSpecifierExpression));
                return undefined;
            }
            // Otherwise, for older TypeScript versions, we'll have to first import and then re-export the namespace
            else {
                context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, factory.createImportClause(false, undefined, factory.createNamespaceImport(factory.createIdentifier(node.name.text))), moduleSpecifierExpression, maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
                const exportClause = factory.createNamedExports([factory.createExportSpecifier(false, undefined, factory.createIdentifier(node.name.text))]);
                context.addTrailingStatements(tsFactoryDecoratorsInterop(context, factory.createExportDeclaration)(undefined, false, exportClause));
                return undefined;
            }
        }
        // Otherwise, the 'foo = require("bar")' VariableDeclaration can be safely transformed into a simple import such as 'import foo from "bar"' or 'import * as foo from "bar"',
        // depending on whether or not the module has a default export
        else {
            const willReassign = willReassignIdentifier(node.name.text, sourceFile, typescript);
            const newName = willReassign ? context.getFreeIdentifier(node.name.text, true) : node.name.text;
            context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, moduleExports == null || moduleExports.hasDefaultExport
                ? // Import the default if it has any (or if we don't know if it has)
                    factory.createImportClause(false, factory.createIdentifier(newName), undefined)
                : // Otherwise, import the entire namespace
                    factory.createImportClause(false, undefined, factory.createNamespaceImport(factory.createIdentifier(newName))), factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
            if (willReassign) {
                // Now, immediately add a local mutable variable with the correct name
                context.addLeadingStatements(factory.createVariableStatement(undefined, factory.createVariableDeclarationList([factory.createVariableDeclaration(node.name.text, undefined, undefined, factory.createIdentifier(newName))], typescript.NodeFlags.Let)));
            }
            return undefined;
        }
    }
    // This will be something like '{foo} = require("bar")', '{foo, bar} = require("bar")', '{foo: bar} = require("bar")', or event '{foo: {bar: baz}} = require("bar")'.
    // We will only consider the simplest variants of these before opting out and letting the CallExpression visitor handle more sophisticated behavior
    else if (moduleExports != null && typescript.isObjectBindingPattern(node.name)) {
        const importSpecifiers = [];
        for (const element of node.name.elements) {
            // When the propertyName is null, the name will always be an identifier.
            // This will be something like '{foo} = require("bar")'
            if (element.propertyName == null && typescript.isIdentifier(element.name)) {
                // If there is no named export matching the identifier, opt out and proceed with the
                // child continuation for more sophisticated handling
                if (!moduleExports.namedExports.has(element.name.text)) {
                    return childContinuation(node);
                }
                importSpecifiers.push(factory.createImportSpecifier(false, undefined, factory.createIdentifier(element.name.text)));
            }
            // This will be something like '{foo: bar} = require("bar")'
            else if (element.propertyName != null && typescript.isIdentifier(element.propertyName) && typescript.isIdentifier(element.name)) {
                // If there is no named export matching the identifier of the property name, opt out and proceed with the
                // child continuation for more sophisticated handling
                if (!moduleExports.namedExports.has(element.propertyName.text)) {
                    return childContinuation(node);
                }
                importSpecifiers.push(factory.createImportSpecifier(false, factory.createIdentifier(element.propertyName.text), factory.createIdentifier(element.name.text)));
            }
            else {
                // Opt out and proceed with the child continuation for more sophisticated handling
                return childContinuation(node);
            }
        }
        // If more than 0 import specifier was generated, add an ImportDeclaration and remove this VariableDeclaration
        if (importSpecifiers.length > 0) {
            const importSpecifiersThatWillBeReassigned = importSpecifiers.filter(importSpecifier => willReassignIdentifier(importSpecifier.name.text, sourceFile, typescript));
            const otherImportSpecifiers = importSpecifiers.filter(importSpecifier => !importSpecifiersThatWillBeReassigned.includes(importSpecifier));
            // Add an import, but bind the name to free identifier
            for (const importSpecifier of importSpecifiersThatWillBeReassigned) {
                const propertyName = (_a = importSpecifier.propertyName) !== null && _a !== void 0 ? _a : importSpecifier.name;
                const newName = context.getFreeIdentifier(importSpecifier.name.text, true);
                const namedImports = factory.createNamedImports([factory.createImportSpecifier(false, factory.createIdentifier(propertyName.text), factory.createIdentifier(newName))]);
                context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, factory.createImportClause(false, undefined, namedImports), factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
                // Now, immediately add a local mutable variable with the correct name
                context.addLeadingStatements(factory.createVariableStatement(undefined, factory.createVariableDeclarationList([factory.createVariableDeclaration(importSpecifier.name.text, undefined, undefined, factory.createIdentifier(newName))], typescript.NodeFlags.Let)));
            }
            if (otherImportSpecifiers.length > 0) {
                context.addImport(tsFactoryDecoratorsInterop(context, factory.createImportDeclaration)(undefined, factory.createImportClause(false, undefined, factory.createNamedImports(otherImportSpecifiers)), factory.createStringLiteral(transformedModuleSpecifier), maybeGenerateAssertClause(context, transformedModuleSpecifier, moduleExports === null || moduleExports === void 0 ? void 0 : moduleExports.assert)), moduleSpecifier);
            }
            return undefined;
        }
    }
    // Otherwise, proceed with the child continuation
    return childContinuation(node);
}

function isNotEmittedStatement(node, typescript) {
    return node.kind === typescript.SyntaxKind.NotEmittedStatement;
}

/**
 * Visits the given VariableDeclarationList
 */
function visitVariableDeclarationList({ node, childContinuation, context }) {
    if (context.onlyExports) {
        return childContinuation(node);
    }
    const { typescript, factory } = context;
    const continuationResult = childContinuation(node);
    // If the result isn't a new VariableDeclarationList, return that result
    if (continuationResult == null || isNodeArray(continuationResult) || !typescript.isVariableDeclarationList(continuationResult)) {
        return continuationResult;
    }
    // Check if there are any VariableDeclarations left to be emitted
    const remainingDeclarations = continuationResult.declarations.filter(declaration => !isNotEmittedStatement(declaration, typescript));
    // If not, return the continuation result
    if (remainingDeclarations.length === 0)
        return continuationResult;
    // Otherwise, return an updated version of the declaration list, preserving only those declarations that should be emitted
    return factory.updateVariableDeclarationList(node, remainingDeclarations);
}

function hasExportAssignments(node, exportsName, typescript) {
    const result = typescript.forEachChild(node, nextNode => {
        if (isExpression(nextNode, typescript)) {
            if (getExportsData(nextNode, exportsName, typescript) != null)
                return true;
        }
        if (hasExportAssignments(nextNode, exportsName, typescript)) {
            return true;
        }
        return;
    });
    return result != null ? result : false;
}
function getBestBodyInScope({ node, context }) {
    const { typescript, factory } = context;
    if (!typescript.isSourceFile(node)) {
        return node;
    }
    const [firstStatement] = node.statements;
    if (!typescript.isExpressionStatement(firstStatement))
        return node;
    const expression = walkThroughFillerNodes(firstStatement.expression, typescript);
    if (!typescript.isCallExpression(expression))
        return node;
    const expressionExpression = walkThroughFillerNodes(expression.expression, typescript);
    if (!typescript.isFunctionExpression(expressionExpression))
        return node;
    if (expression.arguments.length < 2)
        return node;
    let [, secondArgument] = expression.arguments;
    secondArgument = walkThroughFillerNodes(secondArgument, typescript);
    if (!typescript.isFunctionExpression(secondArgument))
        return node;
    if (secondArgument.parameters.length < 1)
        return node;
    const [firstBodyParameter] = secondArgument.parameters;
    if (!typescript.isIdentifier(firstBodyParameter.name))
        return node;
    if (hasExportAssignments(secondArgument.body, firstBodyParameter.name.text, typescript)) {
        context.exportsName = firstBodyParameter.name.text;
        return factory.updateSourceFile(node, [...secondArgument.body.statements, ...node.statements.slice(1)], node.isDeclarationFile, node.referencedFiles, node.typeReferenceDirectives, node.hasNoDefaultLib, node.libReferenceDirectives);
    }
    return node;
}

/**
 * Visits the given Node
 */
function visitNode(options) {
    const { typescript } = options.context;
    const bestNode = getBestBodyInScope(options);
    if (bestNode != null && bestNode !== options.node) {
        return options.childContinuation(bestNode);
    }
    if (typescript.isVariableDeclarationList(options.node)) {
        return visitVariableDeclarationList(options);
    }
    else if (typescript.isVariableDeclaration(options.node)) {
        return visitVariableDeclaration(options);
    }
    else if (typescript.isBinaryExpression(options.node)) {
        return visitBinaryExpression(options);
    }
    else if (typescript.isCallExpression(options.node)) {
        return visitCallExpression(options);
    }
    return options.childContinuation(options.node);
}

/**
 * Returns true if the given Node contains an empty child
 */
function shouldSkipEmit(node, typescript) {
    if (!node)
        return true;
    if (isNodeArray(node))
        return node.some(otherNode => shouldSkipEmit(otherNode, typescript));
    if (typescript.isSourceFile(node))
        return false;
    if (typescript.isBlock(node))
        return false;
    return isNotEmittedStatement(node, typescript) || Boolean(typescript.forEachChild(node, nextNode => shouldSkipEmit(nextNode, typescript)));
}

/**
 * Visits the given ImportDeclaration
 */
function visitImportDeclaration({ node, context }) {
    if (!context.typescript.isStringLiteralLike(node.moduleSpecifier))
        return undefined;
    context.addImport(node, node.moduleSpecifier.text, true);
    return undefined;
}

/**
 * Visits the given ExportDeclaration
 */
function visitExportDeclaration({ node, context }) {
    if (node.exportClause != null && context.typescript.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
            // If the name is 'default' that name is considered special since it represents the default export
            // rather than a named export
            if (element.name.text === "default") {
                context.markDefaultAsExported();
            }
            else {
                // Mark the name as a named export. If the propertyName is different, that's fine
                // - we care about the exported binding name, nothing else
                context.markLocalAsExported(element.name.text);
            }
        }
    }
    return undefined;
}

/**
 * Visits the given ExportAssignment
 *
 * @param options
 * @returns
 */
function visitExportAssignment({ context }) {
    context.markDefaultAsExported();
    return undefined;
}

function hasDefaultExportModifier(node, typescript) {
    return hasExportModifier(node, typescript) && hasModifier(node, typescript.SyntaxKind.DefaultKeyword);
}

/**
 * Visits the given Node
 *
 * @param options
 * @returns
 */
function visitImportAndExportDeclarations(options) {
    const { typescript } = options.context;
    if (typescript.isImportDeclaration(options.node)) {
        return visitImportDeclaration(options);
    }
    else if (typescript.isExportDeclaration(options.node)) {
        return visitExportDeclaration(options);
    }
    else if (typescript.isExportAssignment(options.node)) {
        return visitExportAssignment(options);
    }
    else if (hasDefaultExportModifier(options.node, typescript)) {
        options.context.markDefaultAsExported();
    }
    else if (hasExportModifier(options.node, typescript)) {
        if (isDeclaration(options.node, typescript)) {
            const declarationName = typescript.getNameOfDeclaration(options.node);
            if (declarationName != null && typescript.isIdentifier(declarationName)) {
                options.context.markLocalAsExported(declarationName.text);
            }
        }
        else if (typescript.isVariableStatement(options.node)) {
            for (const declaration of options.node.declarationList.declarations) {
                for (const local of getLocalsForBindingName(declaration.name, typescript)) {
                    options.context.markLocalAsExported(local);
                }
            }
        }
    }
    return options.childContinuation(options.node);
}

function transformSourceFile(sourceFile, context) {
    // Take a fast path of the text of the SourceFile doesn't contain anything that can be transformed
    if (!context.onlyExports && !sourceFile.text.includes("require") && !sourceFile.text.includes("exports")) {
        return { sourceFile, exports: { namedExports: new Set(), hasDefaultExport: false } };
    }
    const { typescript, factory, transformationContext } = context;
    // Prepare a VisitorContext
    const visitorContext = (() => {
        const imports = new Map();
        const leadingStatements = [];
        const trailingStatements = [];
        const moduleExportsMap = new Map();
        const localsMap = sourceFile.locals;
        const locals = localsMap == null ? new Set() : new Set(localsMap.keys());
        const exportedLocals = new Set();
        let isDefaultExported = false;
        const addImport = (declaration, originalModuleSpecifier, noEmit = false) => {
            imports.set(declaration, { originalModuleSpecifier, noEmit });
        };
        const markLocalAsExported = (local) => {
            exportedLocals.add(local);
        };
        const isLocalExported = (local) => exportedLocals.has(local);
        const markDefaultAsExported = () => {
            isDefaultExported = true;
        };
        const addLocal = (local) => {
            locals.add(local);
        };
        const getImportDeclarationWithModuleSpecifier = (moduleSpecifier) => { var _a; return (_a = [...imports.entries()].find(([, { originalModuleSpecifier }]) => originalModuleSpecifier === moduleSpecifier)) === null || _a === void 0 ? void 0 : _a[0]; };
        const isModuleSpecifierImportedWithoutLocals = (moduleSpecifier) => {
            const matchingDeclaration = getImportDeclarationWithModuleSpecifier(moduleSpecifier);
            if (matchingDeclaration == null)
                return false;
            return matchingDeclaration.importClause == null || (matchingDeclaration.importClause.name == null && matchingDeclaration.importClause.namedBindings == null);
        };
        const getLocalForDefaultImportFromModule = (moduleSpecifier) => {
            const matchingDeclaration = getImportDeclarationWithModuleSpecifier(moduleSpecifier);
            if (matchingDeclaration == null)
                return undefined;
            if (matchingDeclaration.importClause == null || matchingDeclaration.importClause.name == null)
                return undefined;
            return matchingDeclaration.importClause.name.text;
        };
        const hasLocalForDefaultImportFromModule = (moduleSpecifier) => getLocalForDefaultImportFromModule(moduleSpecifier) != null;
        const getLocalForNamespaceImportFromModule = (moduleSpecifier) => {
            const matchingDeclaration = getImportDeclarationWithModuleSpecifier(moduleSpecifier);
            if (matchingDeclaration == null) {
                return undefined;
            }
            if (matchingDeclaration.importClause == null ||
                matchingDeclaration.importClause.namedBindings == null ||
                !typescript.isNamespaceImport(matchingDeclaration.importClause.namedBindings)) {
                return undefined;
            }
            return matchingDeclaration.importClause.namedBindings.name.text;
        };
        const hasLocalForNamespaceImportFromModule = (moduleSpecifier) => getLocalForNamespaceImportFromModule(moduleSpecifier) != null;
        const getLocalForNamedImportPropertyNameFromModule = (propertyName, moduleSpecifier) => {
            const matchingDeclaration = getImportDeclarationWithModuleSpecifier(moduleSpecifier);
            if (matchingDeclaration == null)
                return undefined;
            if (matchingDeclaration.importClause == null ||
                matchingDeclaration.importClause.namedBindings == null ||
                !typescript.isNamedImports(matchingDeclaration.importClause.namedBindings)) {
                return undefined;
            }
            for (const element of matchingDeclaration.importClause.namedBindings.elements) {
                if (element.propertyName != null && element.propertyName.text === propertyName)
                    return element.name.text;
                else if (element.propertyName == null && element.name.text === propertyName)
                    return element.name.text;
            }
            return undefined;
        };
        const hasLocalForNamedImportPropertyNameFromModule = (propertyName, moduleSpecifier) => getLocalForNamedImportPropertyNameFromModule(propertyName, moduleSpecifier) != null;
        const addTrailingStatements = (...statements) => {
            trailingStatements.push(...statements);
        };
        const addLeadingStatements = (...statements) => {
            leadingStatements.push(...statements);
        };
        const isIdentifierFree = (identifier) => 
        // It should not be part of locals of the module already
        !locals.has(identifier) &&
            // It should not be a reserved word in any environment
            !check(identifier, "es3", true) &&
            !check(identifier, "es5", true) &&
            !check(identifier, "es2015", true);
        const ignoreIdentifier = (identifier) => locals.delete(identifier);
        const getFreeIdentifier = (candidate, force = false) => {
            const suffix = "$";
            let counter = 0;
            if (isIdentifierFree(candidate) && !force) {
                addLocal(candidate);
                return candidate;
            }
            while (true) {
                const currentCandidate = candidate + suffix + counter;
                if (!isIdentifierFree(currentCandidate)) {
                    counter++;
                }
                else {
                    addLocal(currentCandidate);
                    return currentCandidate;
                }
            }
        };
        return {
            ...context,
            transformSourceFile,
            exportsName: undefined,
            addImport,
            addLocal,
            markLocalAsExported,
            markDefaultAsExported,
            isLocalExported,
            isModuleSpecifierImportedWithoutLocals,
            getImportDeclarationWithModuleSpecifier,
            getLocalForDefaultImportFromModule,
            hasLocalForDefaultImportFromModule,
            getLocalForNamespaceImportFromModule,
            hasLocalForNamespaceImportFromModule,
            getLocalForNamedImportPropertyNameFromModule,
            hasLocalForNamedImportPropertyNameFromModule,
            addLeadingStatements,
            addTrailingStatements,
            isIdentifierFree,
            getFreeIdentifier,
            ignoreIdentifier,
            getModuleExportsForPath: p => moduleExportsMap.get(path.normalize(p)),
            addModuleExportsForPath: (p, exports) => moduleExportsMap.set(path.normalize(p), exports),
            get imports() {
                return [...imports.entries()].filter(([, { noEmit }]) => !noEmit).map(([declaration]) => declaration);
            },
            get leadingStatements() {
                return leadingStatements;
            },
            get trailingStatements() {
                return trailingStatements;
            },
            get isDefaultExported() {
                return isDefaultExported;
            },
            get exportedLocals() {
                return exportedLocals;
            }
        };
    })();
    const visitorBaseOptions = {
        context: visitorContext,
        continuation: node => visitNode({
            ...visitorBaseOptions,
            sourceFile,
            node
        }),
        childContinuation: node => typescript.visitEachChild(node, cbNode => {
            const visitResult = visitNode({
                ...visitorBaseOptions,
                sourceFile,
                node: cbNode
            });
            if (shouldSkipEmit(visitResult, typescript)) {
                return factory.createNotEmittedStatement(cbNode);
            }
            return visitResult;
        }, transformationContext)
    };
    const importVisitorBaseOptions = {
        context: visitorContext,
        continuation: node => visitImportAndExportDeclarations({
            ...importVisitorBaseOptions,
            sourceFile,
            node
        }),
        childContinuation: node => typescript.visitEachChild(node, cbNode => {
            const visitResult = visitImportAndExportDeclarations({
                ...importVisitorBaseOptions,
                sourceFile,
                node: cbNode
            });
            if (shouldSkipEmit(visitResult, typescript)) {
                return factory.createNotEmittedStatement(cbNode);
            }
            return visitResult;
        }, transformationContext)
    };
    // Visit all imports and exports first
    visitImportAndExportDeclarations({ ...importVisitorBaseOptions, sourceFile, node: sourceFile });
    let updatedSourceFile = visitNode({ ...visitorBaseOptions, sourceFile, node: sourceFile });
    const allImports = [
        ...visitorContext.imports,
        ...visitorContext.leadingStatements.filter(typescript.isImportDeclaration),
        ...updatedSourceFile.statements.filter(typescript.isImportDeclaration),
        ...visitorContext.trailingStatements.filter(typescript.isImportDeclaration)
    ];
    const allExports = [
        ...visitorContext.leadingStatements.filter(statement => typescript.isExportDeclaration(statement) || typescript.isExportAssignment(statement)),
        ...updatedSourceFile.statements.filter(statement => typescript.isExportDeclaration(statement) || typescript.isExportAssignment(statement)),
        ...visitorContext.trailingStatements.filter(statement => typescript.isExportDeclaration(statement) || typescript.isExportAssignment(statement))
    ];
    const allOtherStatements = [
        ...visitorContext.leadingStatements.filter(statement => !allImports.includes(statement) && !allExports.includes(statement)),
        ...updatedSourceFile.statements.filter(statement => !allImports.includes(statement) && !allExports.includes(statement) && statement.kind !== typescript.SyntaxKind.NotEmittedStatement),
        ...visitorContext.trailingStatements.filter(statement => !allImports.includes(statement) && !allExports.includes(statement))
    ];
    updatedSourceFile = factory.updateSourceFile(updatedSourceFile, [...allImports, ...allOtherStatements, ...allExports], sourceFile.isDeclarationFile, sourceFile.referencedFiles, sourceFile.typeReferenceDirectives, sourceFile.hasNoDefaultLib, sourceFile.libReferenceDirectives);
    // Update the SourceFile with the extra statements
    const moduleExports = {
        hasDefaultExport: false,
        namedExports: new Set()
    };
    function hasModifiers(node) {
        return Boolean('modifiers' in node && node.modifiers);
    }
    for (const statement of updatedSourceFile.statements) {
        if (typescript.isExportDeclaration(statement) && statement.exportClause != null && typescript.isNamedExports(statement.exportClause)) {
            for (const element of statement.exportClause.elements) {
                moduleExports.namedExports.add(element.name.text);
            }
        }
        else if (typescript.isExportAssignment(statement)) {
            moduleExports.hasDefaultExport = true;
        }
        else if (hasModifiers(statement) && statement.modifiers.some((m) => m.kind === typescript.SyntaxKind.ExportKeyword)) {
            if (statement.modifiers.some((m) => m.kind === typescript.SyntaxKind.DefaultKeyword)) {
                moduleExports.hasDefaultExport = true;
            }
            else if (typescript.isVariableStatement(statement)) {
                for (const declaration of statement.declarationList.declarations) {
                    for (const local of getLocalsForBindingName(declaration.name, typescript)) {
                        moduleExports.namedExports.add(local);
                    }
                }
            }
            else if (isNamedDeclaration(statement, typescript) && statement.name != null && typescript.isIdentifier(statement.name)) {
                moduleExports.namedExports.add(statement.name.text);
            }
        }
    }
    // Add the relevant module exports for the SourceFile
    visitorContext.addModuleExportsForPath(path.normalize(sourceFile.fileName), moduleExports);
    if (!visitorContext.onlyExports && shouldDebug(visitorContext.debug, sourceFile) && visitorContext.printer != null) {
        visitorContext.logger.debug("===", path.native.normalize(sourceFile.fileName), "===");
        visitorContext.logger.debug(visitorContext.printer.printFile(updatedSourceFile));
        visitorContext.logger.debug("EXPORTS:", visitorContext.exportedLocals);
    }
    return {
        sourceFile: updatedSourceFile,
        exports: moduleExports
    };
}

const realReadonlyFileSystem = {
    statSync: fs.statSync,
    lstatSync: fs.lstatSync,
    readdirSync: fs.readdirSync,
    readFileSync: fs.readFileSync
};
const realFileSystem = {
    ...realReadonlyFileSystem,
    mkdirSync: fs.mkdirSync,
    writeFileSync: fs.writeFileSync
};
function createSafeFileSystem(fileSystem) {
    return {
        ...fileSystem,
        safeReadFileSync: path => {
            try {
                return fileSystem.readFileSync(path);
            }
            catch {
                return undefined;
            }
        },
        safeStatSync: path => {
            try {
                return fileSystem.statSync(path);
            }
            catch {
                return undefined;
            }
        }
    };
}

/**
 * A logger that can print to the console
 */
class Logger {
    constructor(logLevel) {
        this.logLevel = logLevel;
        this.VERBOSE_COLOR = "cyan";
        this.WARNING_COLOR = "yellow";
        this.DEBUG_COLOR = "magenta";
    }
    /**
     * Logs info-related messages
     */
    info(...messages) {
        if (this.logLevel < 1 /* LogLevelKind.INFO */)
            return;
        console.log(...messages);
    }
    /**
     * Logs verbose-related messages
     */
    verbose(...messages) {
        if (this.logLevel < 2 /* LogLevelKind.VERBOSE */)
            return;
        console.log(color[this.VERBOSE_COLOR]("[VERBOSE]"), ...messages);
    }
    /**
     * Logs debug-related messages
     */
    debug(...messages) {
        if (this.logLevel < 3 /* LogLevelKind.DEBUG */)
            return;
        console.log(color[this.DEBUG_COLOR]("[DEBUG]"), ...messages);
    }
    /**
     * Logs warning-related messages
     */
    warn(...messages) {
        console.log(color[this.WARNING_COLOR](`(!)`), ...messages);
    }
}

function createTaskOptions({ typescript = ts, fileSystem = realReadonlyFileSystem, debug = false, cwd = process.cwd(), preserveModuleSpecifiers = "external", importAssertions = true, logger = new Logger(debug !== false ? 3 /* LogLevelKind.DEBUG */ : 0 /* LogLevelKind.NONE */) } = {}) {
    return {
        typescript,
        fileSystem,
        debug,
        cwd,
        preserveModuleSpecifiers,
        importAssertions,
        logger
    };
}

function cjsToEsmTransformer(options = {}) {
    return context => {
        var _a;
        const sanitizedOptions = createTaskOptions(options);
        const { fileSystem, typescript } = sanitizedOptions;
        // Prepare a VisitorContext
        const visitorContext = {
            ...sanitizedOptions,
            transformationContext: context,
            factory: ensureNodeFactory((_a = context.factory) !== null && _a !== void 0 ? _a : typescript),
            fileSystem: createSafeFileSystem(fileSystem),
            onlyExports: false,
            resolveCache: new Map(),
            printer: typescript.createPrinter()
        };
        return sourceFile => transformSourceFile(sourceFile, visitorContext).sourceFile;
    };
}

/**
 * CustomTransformer that converts CommonJS to tree-shakeable ESM
 */
function cjsToEsm(options) {
    return {
        before: [cjsToEsmTransformer(options)]
    };
}

function createCompilerHost({ cwd, fileSystem, typescript }) {
    return {
        readFile(fileName) {
            try {
                return fileSystem.readFileSync(fileName).toString();
            }
            catch {
                return undefined;
            }
        },
        directoryExists(directoryName) {
            try {
                return fileSystem.statSync(directoryName).isDirectory();
            }
            catch {
                return false;
            }
        },
        fileExists(directoryName) {
            try {
                return fileSystem.statSync(directoryName).isFile();
            }
            catch {
                return false;
            }
        },
        writeFile: () => {
            // This is a noop
        },
        getSourceFile(fileName, languageVersion) {
            const normalized = path.normalize(fileName);
            const sourceText = this.readFile(fileName);
            if (sourceText == null)
                return undefined;
            return typescript.createSourceFile(normalized, sourceText, languageVersion, true, getScriptKindFromPath(normalized, typescript));
        },
        getCurrentDirectory() {
            return path.native.normalize(cwd);
        },
        getDirectories(directoryName) {
            return typescript.sys.getDirectories(directoryName).map(path.native.normalize);
        },
        getDefaultLibFileName(compilerOpts) {
            return typescript.getDefaultLibFileName(compilerOpts);
        },
        getCanonicalFileName(fileName) {
            return this.useCaseSensitiveFileNames() ? fileName : fileName.toLowerCase();
        },
        getNewLine() {
            return typescript.sys.newLine;
        },
        useCaseSensitiveFileNames() {
            return typescript.sys.useCaseSensitiveFileNames;
        },
        realpath(p) {
            return path.native.normalize(p);
        }
    };
}
/**
 * Gets a ScriptKind from the given path
 */
const getScriptKindFromPath = (p, typescript) => {
    if (p.endsWith(".js")) {
        return typescript.ScriptKind.JS;
    }
    else if (p.endsWith(".ts") || p.endsWith(".mts") || p.endsWith(".cts")) {
        return typescript.ScriptKind.TS;
    }
    else if (p.endsWith(".tsx")) {
        return typescript.ScriptKind.TSX;
    }
    else if (p.endsWith(".jsx")) {
        return typescript.ScriptKind.JSX;
    }
    else if (p.endsWith(".json")) {
        return typescript.ScriptKind.JSON;
    }
    else {
        return typescript.ScriptKind.Unknown;
    }
};

const TEMPORARY_SUBFOLDER_NAME = "__$$temporary_subfolder$$__";

/**
 * Executes the 'generate' task
 */
async function transformTask(options) {
    let { logger, input, cwd, outDir, fileSystem, write, typescript, debug, preserveModuleSpecifiers, importAssertions, hooks } = options;
    logger.debug("Options:", inspect({ input, outDir, cwd, write, debug, preserveModuleSpecifiers, importAssertions }, {
        colors: true,
        depth: Infinity,
        maxArrayLength: Infinity
    }));
    // Match files based on the glob(s)
    const matchedFiles = new Set(ensureArray(input).flatMap(glob => fastGlob.sync(normalizeGlob(path.normalize(glob)), { fs: fileSystem }).map(file => (path.isAbsolute(file) ? path.normalize(file) : path.join(cwd, file)))));
    logger.debug(`Matched files:`, matchedFiles.size < 1 ? "(none)" : [...matchedFiles].map(f => `"${path.native.normalize(f)}"`).join(", "));
    // Prepare the result object
    const result = {
        files: []
    };
    if (matchedFiles.size < 1) {
        return result;
    }
    const closestFolderToRoot = getFolderClosestToRoot(cwd, matchedFiles);
    // We're going to need an outDir no matter what.
    // If none is given, get the folder closest to the root based on the matched files and use that one.
    if (outDir == null) {
        outDir = path.join(closestFolderToRoot, TEMPORARY_SUBFOLDER_NAME);
    }
    // Prepare CompilerOptions
    const compilerOptions = {
        target: typescript.ScriptTarget.ESNext,
        allowJs: true,
        declaration: false,
        outDir,
        sourceMap: false,
        newLine: typescript.sys.newLine === "\n" ? typescript.NewLineKind.LineFeed : typescript.NewLineKind.CarriageReturnLineFeed,
        rootDir: closestFolderToRoot,
        moduleResolution: typescript.ModuleResolutionKind.NodeJs
    };
    // Create a TypeScript program based on the glob
    const program = typescript.createProgram({
        rootNames: [...matchedFiles],
        options: compilerOptions,
        host: createCompilerHost({
            cwd,
            fileSystem,
            typescript
        })
    });
    program.emit(undefined, (fileName, text) => {
        const newFilename = path.normalize(fileName).replace(`/${TEMPORARY_SUBFOLDER_NAME}`, ``);
        const nativeNormalizedFileName = path.native.normalize(newFilename);
        // If a hook was provided, call it
        if (hooks.writeFile != null) {
            const hookResult = hooks.writeFile(nativeNormalizedFileName, text);
            // If it returned a new value, reassign it to `text`
            if (hookResult != null) {
                text = hookResult;
            }
        }
        result.files.push({ fileName: nativeNormalizedFileName, text });
        // Only write files to disk if requested
        if (write) {
            fileSystem.mkdirSync(path.native.dirname(nativeNormalizedFileName), { recursive: true });
            fileSystem.writeFileSync(nativeNormalizedFileName, text);
        }
        logger.info(`${color.green("✔")} ${path.native.relative(cwd, nativeNormalizedFileName)}`);
    }, undefined, false, cjsToEsm(options));
    return result;
}

function createTransformTaskOptions({ fileSystem = realFileSystem, write = true, input, hooks = {}, outDir, ...rest }) {
    if (input == null) {
        throw new ReferenceError(`Missing required argument: 'input'`);
    }
    const taskOptions = createTaskOptions(rest);
    return {
        ...taskOptions,
        write,
        fileSystem,
        hooks,
        input: ensureArray(input).map(file => path.normalize(path.isAbsolute(file) ? file : path.join(taskOptions.cwd, file))),
        outDir: outDir == null ? undefined : path.normalize(path.isAbsolute(outDir) ? outDir : path.join(taskOptions.cwd, outDir))
    };
}

async function transform(options) {
    return transformTask(createTransformTaskOptions(options));
}

export { cjsToEsm, cjsToEsmTransformer, transform };
//# sourceMappingURL=index.js.map
