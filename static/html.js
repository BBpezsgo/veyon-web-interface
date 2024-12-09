'use strict'

/**
 * @param {number} length
 */
function nonce(length) {
    const nonceCharacters = 'abcdefghijklmnopqrstuvwxyz'
    let result = ''
    for (let i = 0; i < length; i++) {
        result += nonceCharacters[Math.floor(Math.random() * nonceCharacters.length)]
    }
    return result
}

/**
 * @param {ReadonlyArray<string>} strings
 * @param  {ReadonlyArray<any>} values
 */
function render(strings, values) {
    let result = ''
    for (let i = 0; i < values.length; i++) {
        result += strings[i]
        const value = values[i]
        switch (typeof value) {
            case 'function':
                let wrapperName = ''
                if (value.wrapperName) {
                    wrapperName = value.wrapperName
                } else {
                    // @ts-ignore
                    while (window[wrapperName = value.name + nonce(16)]) {

                    }
                    // @ts-ignore
                    window[wrapperName] = value
                }
                result += `window.${wrapperName}()`
                value.wrapperName = wrapperName
                break
            default:
                if (value instanceof html.State) {
                    result += value.value
                } else {
                    result += value
                }
                break
        }
    }
    if (strings.length > values.length) result += strings[strings.length - 1]
    result.trim()
    return result
}

/**
 * @param {TemplateStringsArray} strings
 * @param  {Array<any>} values
 */
export default function html(strings, ...values) {
    const wrapper = document.createElement('div')
    wrapper.setHTMLUnsafe(render(strings.raw, values))
    /** @type {HTMLElement} */ // @ts-ignore
    const result = wrapper.firstElementChild
    wrapper.remove()

    for (const value of values) {
        if (value instanceof html.State) {
            // @ts-ignore
            value['onChange'] = () => {
                result.replaceWith(html(strings, ...values))
            }
        }
    }

    return result
}

/**
 * @template T
 */
html.State = class State {
    /** @type {T} */ #value

    get value() {
        return this.#value
    }

    set value(value) {
        if (this.#value === value) { return }
        this.#value = value
        // @ts-ignore
        this['onChange']?.()
    }

    /**
     * @param {T} initialValue
     */
    constructor(initialValue) {
        this.#value = initialValue
    }
}
