'use strict'

import * as Veyon from './veyon.js'

function createScreenElement() {
    const container = document.createElement('div')
    container.classList.add('computer-screen')
    document.getElementById('container')?.appendChild(container)

    const screenHeader1 = document.createElement('div')
    screenHeader1.classList.add('computer-header')
    container.appendChild(screenHeader1)

    const closeButton = document.createElement('button')
    closeButton.innerHTML = 'X'
    screenHeader1.appendChild(closeButton)

    const viewButton = document.createElement('button')
    viewButton.textContent = 'O'
    screenHeader1.appendChild(viewButton)

    const messageButton = document.createElement('button')
    messageButton.textContent = 'M'
    screenHeader1.appendChild(messageButton)

    const addressLabel = document.createElement('span')
    screenHeader1.appendChild(addressLabel)

    const screenHeader2 = document.createElement('div')
    screenHeader2.classList.add('computer-header')
    container.appendChild(screenHeader2)

    const screenUserNameLabel = document.createElement('span')
    screenHeader2.appendChild(screenUserNameLabel)

    const computerNameLabel = document.createElement('span')
    screenHeader2.appendChild(computerNameLabel)

    const screenContainer = document.createElement('div')
    screenContainer.classList.add('screen-container')
    container.appendChild(screenContainer)

    const newScreenImage = document.createElement('img')
    newScreenImage.src = ''
    newScreenImage.classList.add('revealing')
    screenContainer.appendChild(newScreenImage)

    const errorScreen = document.createElement('div')
    errorScreen.classList.add('error-screen')
    screenContainer.appendChild(errorScreen)

    const messageScreen = document.createElement('div')
    messageScreen.classList.add('message-screen')
    screenContainer.appendChild(messageScreen)

    const messagesContainer = document.createElement('div')
    messagesContainer.classList.add('messages-container')
    messageScreen.appendChild(messagesContainer)

    const messageSendContainer = document.createElement('div')
    messageSendContainer.classList.add('message-send-container')
    messageScreen.appendChild(messageSendContainer)

    const messageInput = document.createElement('input')
    messageInput.type = 'text'
    messageSendContainer.appendChild(messageInput)

    const messageSend = document.createElement('button')
    messageSend.textContent = 'Send'
    messageSendContainer.appendChild(messageSend)

    return {
        container: container,

        headerButtons: {
            close: closeButton,
            view: viewButton,
            message: messageButton,
        },

        screens: {
            screen: newScreenImage,
            error: errorScreen,
            message: messageScreen,

            /**
             * @param {'screen' | 'error' | 'message'} screen
             */
            set: function(screen) {
                this.screen.classList[screen === 'screen' ? 'remove' : 'add']('hidden')
                this.error.classList[screen === 'error' ? 'remove' : 'add']('hidden')
                this.message.classList[screen === 'message' ? 'remove' : 'add']('hidden')
            },
        },

        userName: screenUserNameLabel,
        hostName: computerNameLabel,
        addressLabel: addressLabel,

        messageInput: messageInput,
        messageSend: messageSend,
    }
}

/**
 * @typedef {{
 *   connectionRequested: boolean
 *   address: string
 * }} ConnectionRequest
 */

/** @type {Array<ConnectionRequest>} */
const requests = []

/** @type {Array<Veyon.Connection>} */
const connections = []

let ws = new WebSocket(`ws://${location.host}/ws`)

ws.addEventListener('close', () => {
    setTimeout(() => {
        ws = new WebSocket(`ws://${location.host}/ws`)
    }, 2000)
})

ws.addEventListener('message', e => {
    if (typeof e.data !== 'string') { return }
    const message = JSON.parse(e.data)

    /** @type {HTMLCollectionOf<HTMLElement>} */ // @ts-ignore
    const connectionElements = document.getElementsByClassName('connection-element')
    for (const connectionElement of connectionElements) {
        if (connectionElement.dataset['address'] !== message.address) { continue }
        const newMessageElement = document.createElement('div')
        newMessageElement.textContent = `${message.text}`
        newMessageElement.classList.add('message-incoming')
        connectionElement.getElementsByClassName('messages-container').item(0)?.appendChild(newMessageElement)
    }
})

/**
 * @param {HTMLElement} label
 * @param {string} text
 */
function typewriting(label, text) {
    let current = ''
    let length = 0
    const interval = setInterval(() => {
        length++
        if (length > text.length) {
            clearInterval(interval)
        } else {
            current = text.substring(0, length)
            label.textContent = current
        }
    }, 50)
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) { return new Promise(v => setTimeout(v, ms)) }

/**
 * @param {() => Promise<boolean>} callback
 * @returns {Promise<boolean>}
 */
async function retryAsync(callback, maxRetries = 5, cooldown = 0) {
    while (maxRetries--) {
        if (await callback()) return true
        await sleep(cooldown)
    }
    return false
}

/**
 * @param {Promise<Veyon.Connection>} promise
 * @returns {Promise<Veyon.Connection>}
 */
function handleConnection(promise) {
    return new Promise((resolve, reject) => {
        promise
            .then(conn => {
                connections.push(conn)

                const element = createScreenElement()
                element.container.classList.add('connection-element')
                element.container.id = conn.uuid
                element.container.dataset['address'] = conn.host
                element.screens.set('screen')
                typewriting(element.addressLabel, conn.host)

                let isDownloading = false
                /**
                 * @param {boolean} force
                 */
                async function refreshFramebuffer(force) {
                    if (!force) {
                        if (!document.hasFocus()) { return }
                        if (!isElementInViewport(element.screens.screen)) { return }
                        if (!element.screens.screen.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) { return }
                    }
                    if (isDownloading) { return }
                    isDownloading = true

                    if (!conn.connected) {
                        clearInterval(framebufferInterval)
                        isDownloading = false
                        return
                    }

                    try {
                        const framebuffer = await conn.getFramebuffer({
                            format: 'jpeg',
                            width: 320,
                            height: 240,
                            compression: 9,
                            quality: 10,
                        })
                        const reader = new window.FileReader()
                        reader.readAsDataURL(framebuffer)
                        reader.onloadend = function() {
                            element.screens.screen.src = reader.result + ''
                            element.screens.screen.classList.add('revealed')
                        }
                    } catch (error) {
                        if (error instanceof Veyon.APIError && error.code === 2) {
                            element.screens.error.textContent = error.message
                            element.screens.set('error')
                            clearInterval(framebufferInterval)
                        } else {
                            console.error(error)
                        }
                    } finally {
                        isDownloading = false
                    }
                }

                const framebufferInterval = setInterval(() => refreshFramebuffer(false), 2000)

                element.messageSend.addEventListener('click', () => {
                    if (element.screens.message.classList.contains('hidden')) { return }
                    const message = element.messageInput.value
                    element.messageSend.disabled = true

                    conn.getFeatures()
                        .then(features => {
                            console.log(features)
                            features.find(v => v.name === 'StartApp')?.setStatus(true, {
                                applications: [`mshta ${location.protocol}//${location.host}/message?text=${encodeURIComponent(message)}`]
                            })
                                .catch(console.error)
                                .then(() => {
                                    const newMessageElement = document.createElement('div')
                                    newMessageElement.textContent = `${message}`
                                    newMessageElement.classList.add('message-outgoing')
                                    element.screens.message.getElementsByClassName('messages-container').item(0)?.appendChild(newMessageElement)
                                })
                                .finally(() => {
                                    element.messageSend.disabled = false
                                })
                        })
                        .catch(console.error)
                        .finally(() => {
                            element.messageSend.disabled = false
                        })
                })

                element.screens.message.addEventListener('click', () => {
                    if (element.screens.message.classList.contains('hidden')) {
                        element.screens.set('message')
                    } else {
                        element.screens.set('screen')
                    }
                })

                setTimeout(() => {
                    refreshFramebuffer(true)

                    retryAsync(() => {
                        return new Promise(resolve => {
                            conn.getSession().then(session => {
                                typewriting(element.hostName, session.sessionHostName)
                                resolve(!!session.sessionHostName)
                            }).catch(reason => { console.error(reason); resolve(true) })
                        })
                    }, 3, 5000)

                    retryAsync(() => {
                        return new Promise(resolve => {
                            conn.getUser().then(user => {
                                typewriting(element.userName, user.fullName)
                                resolve(!!user.fullName)
                            }).catch(reason => { console.error(reason); resolve(true) })
                        })
                    }, 3, 5000)
                }, 1000)

                element.headerButtons.view.addEventListener('click', () => {
                    window.open(`./screen.html?host=${encodeURIComponent(conn.host)}&uuid=${encodeURIComponent(conn.uuid)}&validUntil=${encodeURIComponent(conn.validUntil)}`, '_blank')?.focus()
                })

                element.headerButtons.close.addEventListener('click', () => {
                    element.headerButtons.close.disabled = true
                    if (conn.connected) {
                        conn.destroy().finally(() => element.headerButtons.close.disabled = false)
                        clearInterval(framebufferInterval)
                    } else {
                        element.container.remove()
                    }
                })

                resolve(conn)
            })
            .catch(error => {
                if (error instanceof Veyon.APIError) {
                    if (error.code === 6) {
                        const element = createScreenElement()
                        element.screens.set('error')
                        element.screens.error.textContent = error.message

                        element.headerButtons.close.addEventListener('click', () => {
                            element.container.remove()
                        })
                    }
                }
                console.error(error)
                reject(error)
            })
    })
}

function loadCredentials() {
    let username = localStorage.getItem('username') ?? prompt('Login:', 'GSZI\\') ?? ''
    let password = localStorage.getItem('password') ?? prompt('Password:', 'asdf123..') ?? ''
    localStorage.setItem('username', username)
    localStorage.setItem('password', password)
    return { username, password }
}

/**
 * @param {HTMLElement} element
 */
function isElementInViewport(element) {
    const rect = element.getBoundingClientRect()
    return (
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
        rect.left < (window.innerWidth || document.documentElement.clientWidth)
    )
}

/**
 * @param {string} address
 * @returns {void}
 */ // @ts-ignore
const queueRequest = window['queueRequest'] = function(address) {
    for (const request of requests) {
        if (request.address === address) { return }
    }
    for (const connection of connections) {
        if (connection.host === address) { return }
    }
    requests.push({
        connectionRequested: false,
        address: address,
    })
};

(async () => {
    /** @type {Array<string>} */
    const savedConnections = JSON.parse(localStorage.getItem('savedConnections') ?? '[]')
    if (savedConnections.length > 0 &&
        confirm('Load saved connections?')
    ) {
        for (const savedConnection of savedConnections) {
            queueRequest(savedConnection)
        }
    }

    const requestInterval = setInterval(() => {
        let n = Math.min(6, requests.length)
        for (let i = 0; i < n; i++) {
            const request = requests[i]
            if (request.connectionRequested) { continue }
            request.connectionRequested = true
            const credentials = loadCredentials()
            const promise = Veyon.Connection.login(request.address, '63611f7c-b457-42c7-832e-67d0f9281085', {
                'username': credentials.username,
                'password': credentials.password,
            })
            handleConnection(promise)
                .then((conn) => {
                    if (!savedConnections.includes(conn.host)) {
                        savedConnections.push(conn.host)
                        localStorage.setItem('savedConnections', JSON.stringify(savedConnections))
                    }
                })
                .finally(() => {
                    for (let j = 0; j < requests.length; j++) {
                        if (requests[j].address === request.address) {
                            requests.splice(j, 1)
                            break
                        }
                    }
                })
            break
        }
    }, 1000)
})();

window.addEventListener('beforeunload', (e) => {
    for (const conn of connections) {
        conn.destroy()
    }
})

// @ts-ignore
window['closeAll'] = function() {
    for (const conn of connections) {
        const container = document.getElementById(conn.uuid)
        conn.destroy()
            .then(() => {
                container?.remove()
            })
    }
};

for (let d = 1; d <= 20; d++) {
    queueRequest(`10.10.104.${d}`)
}
