import React, { useRef, useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import ReactDOM from 'react-dom';
import { useImmer } from "use-immer";
import { PanelGroup, Panel, Tooltip } from 'react-bootstrap';

import Icon from './font-awesome'

import { macroChanged, macroRemoved, macroLocked } from "../reducers/macrosSlice"
import { runCommand } from './com.js';

import { Button, FormControl, ButtonGroup, ButtonToolbar } from 'react-bootstrap'

import Validator from 'validatorjs';

import { useHotkeys } from 'react-hotkeys-hook';

export const MACRO_VALIDATION_RULES = {
    label: 'required',
    gcode: 'required'
}

export function Macros({}) {

        const labelRef = useRef(null);
        const keybindingRef = useRef(null);
        const gcodeRef = useRef(null);

        const dispatch = useDispatch();
        const macros = useSelector((state) => state.macros);

        const [errors, setErrors] = useState(undefined);
        const [editable, setEditable] = useState(false);
        const [selected, setSelected] = useState([]);
        const emptyMacro = { label: "", keybinding: "", gcode: "", _locked: false };
        const [macroState, updateMacroState] = useImmer(emptyMacro);

        const metakeys = ['ctrl', 'shift', 'command', 'alt']

    useEffect(() => {
        if (selected.length === 1){
            setEditable(true);
            if (selected[0] === "")
                updateMacroState((draft) => emptyMacro);
            else
                updateMacroState((draft) => {return {...macros[selected[0]]}});
        } else{
            setEditable(false);
            updateMacroState((draft) => emptyMacro);
        }
    }, [macros, selected]);

    useEffect(() => {
        setErrors(getErrors(macroState));
    }, [macroState])

    function handleSelection(e) {
        let opts = [].slice.call(e.target.selectedOptions).map(o => { return o.value; });
        setSelected(opts);
    }

    function handleAppend(e) {
        let macro = { keybinding: macroState.keybinding, label: macroState.label, gcode: macroState.gcode, _locked: macroState._locked }
        let id =  selected[0];

        if (!errors) {
            dispatch(macroChanged(id, macro));
        } else {
            console.error(JSON.stringify(errors))
        };
        if (id === ""){
            setSelected([]);
            updateMacroState((draft) => emptyMacro);
        }
    }

    function handleRemove(e) {
        for (let i in selected) {
            if (selected[i] !== "" && !macros[selected[i]]._locked)
                dispatch(macroRemoved({id: selected[i]}));
        }
        setSelected([]);
    }

    function handleFormChange(e, fieldid) {
        updateMacroState((draft) => {draft[fieldid] = e.target.value });
    }

    function handleMeta(e, item) {

        let tokens = new Set(macroState.keybinding.trim().split("+"));
        let button = "";
        tokens.forEach((token) => {
            if (!metakeys.includes(token))
                button = token;
        });
        tokens.delete(button);

        if (tokens.has(item)) {
            tokens.delete(item);
        } else {
            tokens.add(item);
        }

        updateMacroState((draft) => {draft.keybinding = Array.from(tokens).sort().concat(button).join('+') });
    }

    function handleLockToggle(e) {
        for (let i in selected) {
            dispatch(macroLocked({id: selected[i]}));
        }
    }

    function getErrors(macro) {
        let validator = new Validator(macro, MACRO_VALIDATION_RULES);
        return (validator.passes()) ? undefined : validator.errors.errors;
    }

    let lockedLabel = macroState._locked ? "Unlock" : "Lock";

        return (
            <div className="macros">
                {/* <small className="help-block">Append new key binding to Gcode. App must be reloaded to take effect </small> */}
                <FormControl componentClass="select" size="10" multiple onChange={(e) => handleSelection(e)} value={selected}>
                    {Object.entries(macros).map((opt, i) => { let [key, value] = opt; return <option key={i} value={key}>{(value.keybinding) ? `[${value.keybinding}] ` : ''}{value.label}{(value._locked) ? " (locked)" : ''}</option> })}
                    <option key={Object.keys(macros).length} value={""}>[New macro...]</option>
                </FormControl>

                <FormControl type="text" ref={labelRef} disabled={!editable || macroState._locked} placeholder="Label" value={macroState.label} onChange={(e) => handleFormChange(e, 'label')} />
                <FormControl type="text" ref={keybindingRef} disabled={!editable || macroState._locked} placeholder="Keybinding" value={macroState.keybinding} onChange={(e) => handleFormChange(e, 'keybinding')} />
                <ButtonGroup>
                    {metakeys.map((meta, i) => { return <Button key={i} disabled={!editable || macroState._locked} bsSize="xsmall" bsStyle={(macroState.keybinding.indexOf(meta) !== -1) ? 'primary' : 'default'} onClick={(e) => handleMeta(e, meta)}>{meta}</Button> })}
                </ButtonGroup>
                <FormControl style={{resize: "vertical", fontFamily: "monospace, monospace"}} componentClass="textarea" disabled={!editable || macroState._locked} ref={gcodeRef} placeholder="Gcode" value={macroState.gcode} onChange={(e) => handleFormChange(e, 'gcode')} />
                <Button bsStyle="primary" disabled={errors !== undefined || macroState._locked || !selected.length} onClick={(e) => handleAppend(e)} style={{ float: "left" }} title={JSON.stringify(errors)}><Icon name="share" /> Set</Button>
                <Button bsStyle="primary" disabled={!selected.length} onClick={(e) => handleLockToggle(e)} style={{ float: "left" }} title={lockedLabel}><Icon name={lockedLabel.toLowerCase()} /> {lockedLabel}</Button>
                <Button bsStyle="danger" disabled={macroState._locked || !selected.length} title={macroState._locked ? 'This is a locked macro' : undefined} onClick={(e) => handleRemove(e)} style={{ float: "right" }}><Icon name="trash" /> Remove</Button>
            </div>

        )
}

export function MacrosBar() {

    const macros = useSelector((state) => state.macros);
    const mode = useSelector((state) => state.panes.selected);

    const hotKeyOptions = {enabled: (mode === 'jog'), preventDefault: true};

    function handleRunMacro(id, macros) {
        let { label, gcode, keybinding } = macros[id];
        console.log('runMacro(' + keybinding + ')');
        runCommand(gcode);
    }

        return (
            <ButtonToolbar>
                {Object.entries(macros).map((macro, i) => {
                    let [id, data] = macro;
                    return(
                        <Button key={i} bsSize="small" onClick={(e) => handleRunMacro(id, macros)} title={"[" + data.keybinding + "]"}>
                            <MacrosHotKeys keybinding={data.keybinding} onTrigger={(e) => handleRunMacro(id, macros)} options={hotKeyOptions} />
                            {data.label}
                        </Button>
                    )
                })
                }
            </ButtonToolbar>

        )
}

function MacrosHotKeys({keybinding, onTrigger, options}) {
    useHotkeys(keybinding, () => onTrigger(), options);
    return null;
}
