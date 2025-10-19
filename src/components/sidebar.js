/**
 * Sidebar module.
 * - Handle sidebar modules.
 * @module
 */

// React/Redux
import React from 'react'
import { useSelector } from 'react-redux'

// Main components
import Dock from './dock'
import Panes from './panes'
import Splitter from './splitter';

/**
 * Sidebar component.
 * - Handle sidebar modules.
 *
 * @extends module:react~React~Component
 * @param {Object} props Component properties.
 */
export default function Sidebar ({style, children}) {

    const visible = useSelector((state) => state.panes.visible);

        return (
            <div id="sidebar" className={"full-height"} style={style} >
                <Dock>{children}</Dock>
                <Splitter
                    split="vertical" initialSize={300} minSize={300} splitterId="sidebar" resizerStyle={{ marginLeft: 2, marginRight: 2 }}
                    style={{ width: visible ? "inherit" : 0 }}
                    >
                    <Panes>{children}</Panes>
                </Splitter>
            </div>
        )
}
