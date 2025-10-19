/**
 * Dock module.
 * @module
 */

// React/Redux
import React from 'react'
import { useSelector, useDispatch } from 'react-redux'

// Font awesome
import Icon from './font-awesome'

// Actions
import * as actions from '../actions/panes'

import { SettingsValidator } from './settings';
import { CAMValidator } from './cam';

import { useHotkeys } from 'react-hotkeys-hook';
/**
 * Dock item component.
 *
 * @extends module:react~React~Component
 * @param {Object} props Component properties.
 */
export function Button({active, dimmed, onClick, title, icon, children}) {
    /**
     * @type {Object}
     * @member module:components/dock~Button.prototype#props
     * @property {String} key Button key.
     * @property {String} title Button title.
     * @property {String} icon Button icon name (font-awesome).
     * @property {Boolean} active True if active button.
     * @property {module:components/dock~onButtonClick} onClick Called on dock item click.
     */

    /**
     * Render the component.
     * @return {String}
     */
        let styleClasses=[];
        if (active) styleClasses.push('active');
        if (dimmed) styleClasses.push('dimmed');
        return (
            <li className={ styleClasses.length ? styleClasses.join(" ") : null  } onClick={ onClick } >
                <div style={{position:'relative'}}>
                    <Icon name={ icon } fw={ true } />
                    <span>{ title }</span>
                    {children}
                </div>
            </li>
        )
}

/**
 * Dock component.
 * - Handle dock buttons.
 *
 * @extends module:react~React~Component
 * @param {Object} props Component properties.
 */
export default function Dock({children}) {
    /**
     * @type {Object}
     * @member module:components/dock~Dock.prototype#props
     * @property {module:react~React~Component|module:react~React~Component[]} children Component children.
     * @property {module:components/dock~onButtonClick} onClick Called on dock item click.
     */

//TODO add hotkeys to switch panes
     const dispatch = useDispatch();
     const selected = useSelector((state) => state.panes.selected);
     const dimmed = !useSelector((state) => state.panes.visible);

     const onButtonClick = (id) => {
         dispatch(actions.selectPane(id))
     }

    /**
     * Render the component.
     * @return {String}
     */
        return (
            <ul className="dock full-height">
                {
                    children.map((item, i) => {

                        let validation;
                        if (item.props.id=='settings') validation=<SettingsValidator className="notification" noneOnSuccess />;
                        if (item.props.id=='cam') validation=<CAMValidator className="notification" noneOnSuccess />;

                        return <Button
                            {...item.props}
                            key={item.props.id}
                            active={item.props.id === selected}
                            dimmed={dimmed}
                            onClick={() => onButtonClick(item.props.id)}
                            >
                                <PaneHotKeys keybinding={"ctrl+"+(i+1)} onTrigger={() => onButtonClick(item.props.id)} />
                                {validation}
                            </Button>
                    })
                }
            </ul>
        )
}

function PaneHotKeys({keybinding, onTrigger}) {
    useHotkeys(keybinding, () => onTrigger(), {preventDefault: true});
    return null;
}
