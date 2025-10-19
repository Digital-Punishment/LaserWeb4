/**
 * Panes module.
 * - Handle panes.
 * @module
 */

// React/Redux
import React from 'react'
import { useSelector } from 'react-redux'

/**
 * Pane component.
 *
 * @extends module:react~React~Component
 * @param {Object} props Component properties.
 */
export function Pane({active, id, children}) {
    /**
     * @type {Object}
     * @member module:components/pane~Pane.prototype#props
     * @property {String} key Pane key.
     * @property {String} title Pane title.
     * @property {String} icon Pane icon name (font-awesome).
     * @property {Boolean} active True if active button.
     * @property {module:react~React~Component|module:react~React~Component[]} children Component children.
     */

    /**
     * Render the component.
     * @return {String}
     */
        return (
            <div className={ "pane" + (active ? " active" : "") + " pane-"+id}>
                <div className="pane-content">{ children }</div>
            </div>
        )
}

/**
 * Panes component.
 * - Handle panes.
 *
 * @extends module:react~React~Component
 * @param {Object} props Component properties.
 */
export default function Panes({style, children}) {

    const selected = useSelector((state) => state.panes.selected);

        return (
            <div className={"panes full-height"} style={style}>
                {
                    children
                        .filter(item => item.props.id === selected)
                        .map(item => (
                            <Pane
                                {...item.props}
                                key={item.props.id}
                                id={item.props.id}
                                active={item.props.id === selected}
                                >
                                {item}
                            </Pane>))
                }
            </div>
        )
}
