/**
 * Font-Awesome module.
 * @module
 */

// React
import React from 'react'

/**
 * Communication component.
 *
 * @extends module:react~React~Component
 * @param {Object} props Component properties.
 */
export default function Icon({name, fw}) {
    /**
     * @type {Object}
     * @member module:components/font-awesome~Icon.prototype#props
     * @property {String} name Icon name (without fa- prefix)
     * @property {Boolean} fw If true display fixed width icon.
     */

    /**
     * Return the icon class name from props.
     * @return {String}
     */
    function getClassName() {
        return 'fa fa-' + name + (fw ? ' fa-fw' : '')
    }

    /**
     * Render the component.
     * @return {String}
     */

        return (
            name ? <i className={ getClassName() }></i> : null
        )
}
