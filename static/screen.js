'use strict'

import * as Veyon from './veyon.js'

const urlParams = new URLSearchParams(window.location.search)
const host = urlParams.get('host')
const uuid = urlParams.get('uuid')
const validUntil = urlParams.get('validUntil')

if (host && uuid && validUntil) {
    const conn = new Veyon.Connection(uuid, Number.parseInt(validUntil), host)

    document.title = `${conn.host} - Veyon`

    conn.getUser()
        .then(user => {
            if (user.fullName) document.title = `${user.fullName} - Veyon`
        })
        .catch()

    const image = document.createElement('img')
    document.body.appendChild(image)

    const interval = setInterval(async () => {
        if (!document.hasFocus()) { return }

        try {
            const framebuffer = await conn.getFramebuffer({
                format: 'jpeg',
                width: 640 * 2,
                height: 480 * 2,
                compression: 9,
                quality: 50,
            })
            const reader = new window.FileReader()
            reader.readAsDataURL(framebuffer)
            reader.onloadend = function() {
                image.src = reader.result + ''
            }
        } catch (error) {
            if (error instanceof Veyon.APIError && error.code === 2) {
                clearInterval(interval)
                alert(`Connection invalidated`)
            } else {
                console.error(error)
            }
        }
    }, 1000)
}
