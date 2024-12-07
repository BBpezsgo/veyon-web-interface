'use strict'

export class APIError extends Error {
    /** @readonly @type {number} */ httpCode
    /** @readonly @type {number} */ code

    /**
     * @param {number} httpCode
     * @param {string} message
     * @param {number} code
     */
    constructor(httpCode, message, code) {
        super(message)
        this.httpCode = httpCode
        this.code = code
    }
}

/**
 * @param {string} path
 * @param {'GET' | 'POST' | 'DELETE' | 'PUT'} method
 * @param {string | null | undefined} body
 * @param {HeadersInit | undefined} headers
 */
function fetchApi(path, method = 'GET', body = undefined, headers = undefined) {
    return new Promise((resolve, reject) => {
        let reqUrl = `http://${window.location.host}/proxy?url=${encodeURIComponent(path)}`
        if (method) { reqUrl += `&method=${encodeURIComponent(method)}` }
        if (body) { reqUrl += `&body=${encodeURIComponent(body)}` }
        if (headers) { reqUrl += `&headers=${encodeURIComponent(JSON.stringify(headers))}` }
        fetch(reqUrl, {
            method: method,
            body: body,
            headers: headers,
        })
            .then(res => {
                if (res.ok) {
                    if (res.headers.get('content-type') === 'text/plain') {
                        res.text()
                            .then(resolve)
                            .catch(reject)
                    } else if (res.headers.get('content-type') === 'application/json') {
                        res.json()
                            .then(resolve)
                            .catch(reject)
                    } else if (res.headers.get('content-type') === 'image/jpeg') {
                        res.blob()
                            .then(resolve)
                            .catch(reject)
                    } else {
                        debugger
                    }
                } else if (res.headers.get('content-type') === 'text/plain') {
                    res.text()
                        .then(text => {
                            reject(new APIError(res.status, text, 0))
                        })
                        .catch(reject)
                } else if (res.headers.get('content-type') === 'application/json') {
                    res.json()
                        .then(error => {
                            if ('error' in error && 'message' in error['error'] && 'code' in error['error'])
                            {
                                reject(new APIError(res.status, error['error']['message'], error['error']['code']))
                            }
                        })
                        .catch(reject)
                } else {
                    res.text()
                        .then(text => {
                            reject(new APIError(res.status, text, 0))
                        })
                        .catch(reject)
                    console.error(res.status)
                }
            })
            .catch(reject)
    })
}

export class Connection {
    /** @type {string} @readonly */ #uuid
    /** @type {number} @readonly */ #validUntil
    /** @type {string} @readonly */ #host
    /** @type {boolean} */ #connected

    /** @returns {string} */ get uuid() { return this.#uuid }
    /** @returns {number} */ get validUntil() { return this.#validUntil }
    /** @returns {string} */ get host() { return this.#host }
    /** @returns {boolean} */ get connected() { return this.#connected }

    /**
     * @param {string} uuid
     * @param {number} validUntil
     * @param {string} host
     */
    constructor(uuid, validUntil, host) {
        this.#uuid = uuid
        this.#validUntil = validUntil
        this.#host = host
        this.#connected = true
    }

    /**
     * @param {string} host
     */
    static async getAuthMethods(host) {
        const v = await fetchApi(`/api/v1/authentication/${host}`)
        return v.methods
    }

    /**
     * @template {keyof AuthMethods} TMethod
     * @param {string} host
     * @param {TMethod} method
     * @param {AuthMethods[TMethod]['args']} credentials
     */
    static async login(host, method, credentials) {
        const res = await fetchApi(`/api/v1/authentication/${host}`, 'POST', JSON.stringify({
            method: method,
            credentials: credentials,
        }))
        return new Connection(res['connection-uid'], Number.parseInt(res['validUntil']), host)
    }

    /**
     * @returns {Promise<void>}
     */
    async destroy() {
        if (!this.#connected) { return }
        this.#connected = false
        await fetchApi(`/api/v1/authentication/${this.#host}`, 'DELETE', undefined, {
            'Connection-Uid': this.#uuid
        })
    }

    /**
     * @param {{
     *   format?: 'png' | 'jpeg'
     *   compression?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
     *   quality?: number
     *   width?: number
     *   height?: number
     * }} param0
     * @returns {Promise<any>}
     */
    async getFramebuffer({ format, compression, quality, width, height }) {
        format ??= 'jpeg'
        compression ??= 9
        quality ??= 10
        width ??= 640
        height ??= 480
        const res = await fetchApi(`/api/v1/framebuffer?format=${format}&compression=${compression}&quality=${quality}&width=${width}&height=${height}`, 'GET', undefined, {
            'Connection-Uid': this.#uuid
        })
        return res
    }

    /**
     * @returns {Promise<ReadonlyArray<Feature>>}
     */
    async getFeatures() {
        /**
         * @type {ReadonlyArray<{
         *   active: boolean;
         *   name: string;
         *   parentUid: string;
         *   uid: string;
         * }>}
         */
        const res = await fetchApi(`/api/v1/feature`, 'GET', undefined, {
            'Connection-Uid': this.#uuid
        })
        const res2 = []
        for (const item of res) {
            res2.push({
                ...item,
                connectionUid: this.#uuid,
                getStatus: async function() {
                    const res = await fetchApi(`/api/v1/feature/${this.uid}`, 'GET', undefined, {
                        'Connection-Uid': this.connectionUid
                    })
                    return !!res.active
                },
                setStatus: async function(/** @type {boolean} */ status, /** @type {any} */ args = undefined) {
                    await fetchApi(`/api/v1/feature/${this.uid}`, 'PUT', JSON.stringify({
                        active: status,
                        arguments: args,
                    }), {
                        'Connection-Uid': this.connectionUid
                    })
                },
            })
        }
        return res2
    }

    /**
     * @returns {Promise<LoginInfo>}
     */
    async getUser() {
        const res = await fetchApi(`/api/v1/user`, 'GET', undefined, {
            'Connection-Uid': this.#uuid
        })
        return res
    }

    /**
     * @returns {Promise<SessionInfo>}
     */
    async getSession() {
        const res = await fetchApi(`/api/v1/session`, 'GET', undefined, {
            'Connection-Uid': this.#uuid
        })
        return res
    }
}

/**
 * @typedef {{
 *   fullName: string
 *   login: string
 * }} LoginInfo
 */

/**
 * @typedef {{
 *   sessionId: number
 *   sessionUptime: number
 *   sessionClientAddress: string
 *   sessionHostName: string
 * }} SessionInfo
 */

/**
 * @typedef {{
 *  '0c69b301-81b4-42d6-8fae-128cdd113314': { name: 'AuthKeys', args: { 'keyname': string, 'keydata': string } }
 *  '6f0a491e-c1c6-4338-8244-f823b0bf8670': { name: 'AuthLDAP', args: { 'username': string, 'password': string } }
 *  '63611f7c-b457-42c7-832e-67d0f9281085': { name: 'AuthLogon', args: { 'username': string, 'password': string } }
 *  '73430b14-ef69-4c75-a145-ba635d1cc676': { name: 'AuthSimple', args: { 'password': string } }
 * }} AuthMethods
 */

/**
 * @typedef {{
 *   active: boolean
 *   name: string
 *   parentUid: string
 *   uid: string
 *   getStatus: () => Promise<boolean>
 *   setStatus: (status: boolean, args?: any) => Promise<void>
 * }} Feature
 */
