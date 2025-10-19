import React, { useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import ReactDOM from 'react-dom';
import { useImmer } from "use-immer";
import { PanelGroup, Panel, Tooltip } from 'react-bootstrap';

import Icon from './font-awesome'

import { addMacro, removeMacro, setMacro, fireMacroById } from '../actions/macros'
import { runCommand } from './com.js';

import { Button, FormControl, ButtonGroup, ButtonToolbar } from 'react-bootstrap'

import Validator from 'validatorjs';
import { MACRO_VALIDATION_RULES } from '../reducers/macros'
import { v4 as uuidv4 } from 'uuid';

export function Macros({}) {

        const labelRef = useRef(null);
        const keybindingRef = useRef(null);
        const gcodeRef = useRef(null);

        const dispatch = useDispatch();
        const macros = useSelector((state) => state.settings.macros);

        const [macroState, updateMacroState] = useImmer({ selected: [], label: "", keybinding: "", gcode: "", meta: [], _locked: false });

        const metakeys = ['ctrl', 'shift', 'command', 'alt']


    function handleSelection(e) {
        let opts = [].slice.call(e.target.selectedOptions).map(o => { return o.value; });
        updateMacroState((draft) => {draft.selected = opts });
        if (e.target.value) {
            updateMacroState((draft) => {Object.assign(draft, { _locked: macros[e.target.value]._locked || false }, macros[e.target.value])});
        } else {
            updateMacroState((draft) => {Object.assign(draft, { keybinding: "", label: "", gcode: "", _locked: false })});
        }

    }

    function handleAppend(e) {
        let macro = { keybinding: [...macroState.meta, macroState.keybinding].join('+'), label: macroState.label, gcode: macroState.gcode }
        let errors = getErrors(macro);

        if (!errors && macroState.selected.length < 2) {
            let id = (macroState.selected.length) ? macroState.selected[0] : uuidv4();
            dispatch(setMacro({ [id]: macro }));
        } else {
            console.error(JSON.stringify(errors))
        }

        updateMacroState((draft) => {Object.assign(draft, { ...macro, selected: [] })});
    }

    function handleRemove(e) {
        dispatch(removeMacro(macroState.selected));
        updateMacroState((draft) => {Object.assign(draft, { selected: [], keybinding: "", label: "", gcode: "", _locked: false })});
    }

    function handleFormChange(e, fieldid) {
        updateMacroState((draft) => {draft[fieldid] = e.target.value });
    }

    function handleMeta(e, item) {

        let tokens = new Set(macroState.keybinding.trim().split("+"));

        if (tokens.has(item)) {
            tokens.delete(item);
        } else {
            tokens.add(item);
        }

        updateMacroState((draft) => {draft.keybinding = Array.from(tokens).sort().join('+') });
    }

    function getErrors(macro) {
        let validator = new Validator(macro, MACRO_VALIDATION_RULES);
        return (validator.passes()) ? undefined : validator.errors.errors;
    }

        let errors = getErrors(macroState);

        return (
            <div className="macros">
                <small className="help-block">Append new key binding to Gcode. App must be reloaded to take effect</small>
                <FormControl componentClass="select" size="10" multiple onChange={(e) => handleSelection(e)} value={macroState.selected}>
                    {Object.entries(macros).map((opt, i) => { let [key, value] = opt; return <option key={i} value={key}>{(value.keybinding) ? `[${value.keybinding}] ` : ''}{value.label}</option> })}
                </FormControl>

                <FormControl type="text" ref={labelRef} placeholder="Label" value={macroState.label} onChange={(e) => handleFormChange(e, 'label')} />
                <FormControl type="text" ref={keybindingRef} placeholder="Keybinding" value={macroState.keybinding} onChange={(e) => handleFormChange(e, 'keybinding')} />
                <ButtonGroup>
                    {metakeys.map((meta, i) => { return <Button key={i} bsSize="xsmall" bsStyle={(macroState.keybinding.indexOf(meta) !== -1) ? 'primary' : 'default'} onClick={(e) => handleMeta(e, meta)}>{meta}</Button> })}
                </ButtonGroup>
                <FormControl style={{resize: "vertical", fontFamily: "monospace, monospace"}} componentClass="textarea" ref={gcodeRef} placeholder="Gcode" value={macroState.gcode} onChange={(e) => handleFormChange(e, 'gcode')} />
                <Button bsStyle="primary" disabled={(errors !== undefined) || macroState._locked} onClick={(e) => handleAppend(e)} style={{ float: "left" }} title={JSON.stringify(errors)}><Icon name="share" /> Set</Button>
                <Button bsStyle="danger" disabled={macroState._locked} title={macroState._locked ? 'This is a locked macro' : undefined} onClick={(e) => handleRemove(e)} style={{ float: "right" }}><Icon name="trash" /> Remove</Button>
            </div>

        )
}

export function MacrosBar() {

    const macros = useSelector((state) => state.settings.macros);

    function handleRunMacro(id, macros) {
        let { label, gcode, keybinding } = macros[id];
        console.log('runMacro(' + keybinding + ')');
        runCommand(gcode);
    }

        return (
            <ButtonToolbar>
                {Object.entries(macros).map((macro, i) => {
                    let [id, data] = macro;
                    return <Button key={i} bsSize="small" onClick={(e) => handleRunMacro(id, macros)} title={"[" + data.keybinding + "]"}>{data.label}</Button>
                })
                }
            </ButtonToolbar>

        )
}
