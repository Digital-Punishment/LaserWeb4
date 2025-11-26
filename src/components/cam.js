// Copyright 2016 Todd Fleming
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import { Helper as dxfHelper} from 'dxf';
import Parser from '../lib/lw.svg-parser/parser';
import React, { useState, useContext, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useImmer } from "use-immer";

import { loadDocument, setDocumentAttrs, cloneDocumentSelected, selectDocuments, colorDocumentSelected, removeDocumentSelected, selectDocumentsByColor } from '../actions/document';

import { setGcode, generatingGcode } from '../actions/gcode';
import { resetWorkspace } from '../actions/laserweb';
import { Documents } from './document';
import { DocumentCacheContext } from './document-cache'
import { Operations, Error } from './operation';
import { OperationDiagram } from './operation-diagram';
import Splitter from './splitter';
import { getGcode } from '../lib/cam-gcode';
import { sendAsFile, appendExt, openDataWindow, captureConsole, humanFileSize } from '../lib/helpers';
import { strftime } from '../lib/strftime.js'
import { ValidateSettings } from '../reducers/settings';
import { ApplicationSnapshotToolbar } from './settings';

import { Button, ButtonToolbar, ButtonGroup, ProgressBar, Alert } from 'react-bootstrap'
import Icon from './font-awesome'
import { alert, prompt, confirm } from './laserweb'

import CommandHistory from './command-history'
import { FileField, Info, ColorPicker, SearchButton } from './forms'

import { promisedImage, imageTagPromise } from './image-filters';

import convert from 'color-convert'

export const DOCUMENT_FILETYPES = '.png,.jpg,.jpeg,.bmp,.gcode,.g,.svg,.dxf,.tap,.gc,.nc'


export function CAMValidator({noneOnSuccess, className, style}) {

        const documents = useSelector((state) => state.documents.length);

        let errors = (!documents) ? "Add files to begin" : undefined
        if (noneOnSuccess && !errors) return null;
        return <span className={className} title={errors ? errors : "Good to go!"} style={style}><Icon name={errors ? 'warning' : 'check'} /></span>
}

export default function Cam() {

    const [filter, setFilter] = useState(null);
    const [showTip, setShowTip] = useState(false);
    const [QE, setQE] = useState(null);

    const initialGcodeState = {
        processing: false,
        percent: 0,
    }
    const [gcoding, updateGcoding] = useImmer(initialGcodeState);

    const dispatch = useDispatch();
    const settings = useSelector((state) => state.settings);
    const documents = useSelector((state) => state.documents);
    const operations = useSelector((state) => state.operations);
    const macros = useSelector((state) => state.macros);
    const currentOperation = useSelector((state) => state.currentOperation);
    const gcode = useSelector((state) => state.gcode.content);
    const dirty = useSelector((state) => state.gcode.dirty);
    const panes = useSelector((state) => state.panes);
    const splitters = useSelector((state) => state.splitters);

    const { documentsCache } = useContext(DocumentCacheContext);

    const tipRef = useRef(null);

    useEffect(() => {
        setShowTip(documents.length === 0 && (operations.length === 0 || !settings.toolCreateEmptyOps));
    }, [documents, operations]);

    function generateGcode(e) {
        updateGcoding((draft) => {draft.processing = true; draft.percent = 0;})
        setQE(getGcode(
            settings,
            documents,
            operations,
            macros,
            documentsCache,
            (msg, level) => { CommandHistory.write(msg, level); },  // showAlert
            (gcode) => {                                            // done
                updateGcoding(initialGcodeState);
                dispatch(setGcode(gcode));
            },
            (threads) => {                                          // progress
                updateGcoding((draft) => {draft.percent = ((Array.isArray(threads)) ? (threads.reduce((a, b) => a + b, 0) / threads.length) : threads).toFixed()});
            }
        ))
    }

    function stopGcode(e) {
        if (QE) {
            QE.end();
            console.log('User interrupted Gcode generation')
         }
    }

    const saveGcode = (e) => {
        prompt(
            'Save as',
            strftime(settings.gcodeFilename),
            (file) => {
                if (file !== null)
                    sendAsFile(appendExt(file, settings.gcodeExtension), gcode)
            },
            !e.shiftKey)
    };
    const viewGcode = (e) => {
        if (gcode.length < 1048576) {
            openDataWindow(gcode);
        } else {
            confirm("Size: " + humanFileSize(gcode.length) + ", viewing very large files can negatively affect browser performance. Are you sure?",
                (data) => { if (data) openDataWindow(gcode); },
                e.shiftKey)
        }};

        const toggleDocumentExpanded = d => dispatch(setDocumentAttrs({ expanded: !d.expanded }, d.id));

        const clearGcode = (e) => {
            confirm("This will delete the currently loaded Gcode. Are you sure?", (data) => { if (data) dispatch(setGcode("")); }, e.shiftKey)
        };

        const handleResetWorkspace = () => {
            confirm("This will completely erase your workspace! Are you sure?", (data) => { if (data) dispatch(resetWorkspace()); })
        };

        const handleLoadDocument = (e, modifiers = {}) => {
            // TODO: report errors
            for (let file of e.target.files) {
                let reader = new FileReader;
                if (file.name.substr(-4) === '.svg') {
                    reader.onload = () => {
                        const release = captureConsole()

                        //console.log('CAM.js: loadDocument: SVG constructing Parser');
                        let parser = new Parser({});
                        parser.parse(reader.result)
                            .then((tags) => {
                                let captures = release(true);
                                let warns = captures.filter(i => i.method == 'warn')
                                let errors = captures.filter(i => i.method == 'errors')
                                if (warns.length)
                                    CommandHistory.dir("The file has minor issues. Please check document is correctly loaded!", warns, 2)
                                if (errors.length)
                                    CommandHistory.dir("The file has serious issues. If you think is not your fault, report to LW dev team attaching the file.", errors, 3)

                                //console.log('loadDocument: imageTagPromise');
                                imageTagPromise(tags).then((tags) => {
                                    //console.log('loadDocument: SVG: dispatch:');
                                    //console.log(':: file: ', file);
                                    //console.log(':: parser: ', parser);
                                    //console.log(':: tag: ', tags );
                                    //console.log(':: modifiers: ', modifiers );
                                    dispatch(loadDocument(file, { parser, tags }, modifiers));
                                })
                            })
                            .catch((e) => {
                                //console.log('loadDocument: catch:', e);
                                release(true);
                                CommandHistory.dir("The file has serious issues. If you think is not your fault, report to LW dev team attaching the file.", String(e), 3)
                                console.error(e)
                            })

                    }
                    //console.log('loadDocument: readAsText');
                    reader.readAsText(file);
                }
                else if (file.name.substr(-4).toLowerCase() === '.dxf') {
                    reader.onload = () => {
                        var helper = new dxfHelper(reader.result);
                        var dxfTree = helper.toPolylines();
                        // console.log('Imported dfxTree:');
                        // console.log(dxfTree);
                        //console.log('loadDocument: DXF: dispatch:');
                        //console.log(':: file: ', file);
                        //console.log(':: dxfTree: ', dxfTree );
                        //console.log(':: modifiers: ', modifiers );
                        dispatch(loadDocument(file, dxfTree, modifiers));
                    }
                    reader.readAsText(file);
                }
                else if (file.type.substring(0, 6) === 'image/') {

                    reader.onload = () => {
                        promisedImage(reader.result)
                            .then((img) => {
                                dispatch(loadDocument(file, reader.result, modifiers, img));
                            })
                            .catch(e => console.log('error:', e))
                    }
                    reader.readAsDataURL(file);
                } else if (file.name.match(/\.(nc|gc|gcode)$/gi)) {
                    let reader = new FileReader;
                    reader.onload = () => dispatch(setGcode(reader.result));
                    reader.readAsText(file);
                }
                else {
                    reader.onload = () => dispatch(loadDocument(file, reader.result, modifiers));
                    reader.readAsDataURL(file);
                }
            }
        };

        const loadGcode = e => {
            let reader = new FileReader;
            reader.onload = () => dispatch(setGcode(reader.result));
            reader.readAsText(e.target.files[0]);
        };

        let validator = ValidateSettings(false)
        let gcodingEnable = !validator.passes() ||  gcoding.processing;
        let someSelected = documents.some((i)=>(i.selected));

        return (
            <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div className="panel panel-danger" style={{ marginBottom: 0 }}>
                    <div className="panel-heading" style={{ padding: 2 }}>
                        <table style={{ width: 100 + '%' }}>
                            <tbody>
                                <tr>
                                    <td>
                                        <label>Workspace</label>
                                    </td>
                                    <td>
                                        <ApplicationSnapshotToolbar loadButton saveButton stateKeys={['documents', 'operations', 'currentOperation', 'settings.toolFeedUnits']} saveName={strftime(settings.workspaceFilename + '.json')} label="Workspace" className="well well-sm">
                                            <Button bsSize="xsmall" bsStyle="warning" onClick={e => handleResetWorkspace(e)}>Reset <Icon name="trash" /></Button>
                                        </ApplicationSnapshotToolbar>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="Resizer horizontal" style={{ marginTop: '2px', marginBottom: '2px' }}></div>
                <div className="panel panel-info" style={{ marginBottom: 3 }}>
                    <div className="panel-heading" style={{ padding: 2 }}>
                        <table style={{ width: 100 + '%' }}>
                            <tbody>
                                <tr>
                                    <td>
                                        <label>Documents {Info(<small>Tip:  Hold <kbd>Ctrl</kbd> to click multiple documents</small>)}</label>
                                    </td>
                                    <td style={{display:"flex", justifyContent: "flex-end" }}>
                                        <FileField style={{ position: 'relative', cursor: 'pointer' }} onChange={(e, modifiers) => handleLoadDocument(e, modifiers)} accept={DOCUMENT_FILETYPES}>
                                            <Button ref={tipRef} title="Add a DXF/SVG/PNG/BMP/JPG document to the document tree" bsStyle="primary" bsSize="xsmall"><i className="fa fa-fw fa-folder-open" />Add Document</Button>
                                            {(panes.visible && tipRef) ? <Error key={splitters.sidebar} target={tipRef.current} show={showTip} id="NoDocumentsError" message="Click here to begin" /> : undefined}
                                    </FileField>&nbsp;
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <Splitter style={{ flexShrink: 0 }} split="horizontal" initialSize={100} resizerStyle={{ marginTop: 2, marginBottom: 2 }} splitterId="cam_documents">
                    <div style={{height:"100%", display:"flex", flexDirection:"column"}} >
                        <div style={{ overflowY: 'auto', flexGrow:1 }}><Documents documents={documents} filter={filter} toggleExpanded={toggleDocumentExpanded} /></div>
                        {documents.length ? <ButtonToolbar bsSize="xsmall" bsStyle="default">
                            <ButtonGroup>
                                <Button  bsStyle="info" bsSize="xsmall" onClick={e=>{dispatch(selectDocuments(true))}} title="Select all"><Icon name="cubes"/></Button>
                                <Button  bsStyle="default" bsSize="xsmall" onClick={e=>{dispatch(selectDocuments(false))}} title="Select none"><Icon name="cubes"/></Button>
                                <Button  bsStyle="success" bsSize="xsmall" disabled={!someSelected} onClick={e=>{dispatch(selectDocumentsByColor(e.shiftKey))}} title="Select all with matching path color(s), Press [SHIFT] to select by fill color"><Icon name="eyedropper"/></Button>
                            </ButtonGroup>
                            <Button  bsStyle="warning" bsSize="xsmall" disabled={!someSelected} onClick={e=>{dispatch(cloneDocumentSelected())}} title="Clone selected"><Icon name="copy"/></Button>
                            <Button  bsStyle="danger" bsSize="xsmall" disabled={!someSelected} onClick={e=>{dispatch(removeDocumentSelected())}} title="Remove selected"><Icon name="trash"/></Button>
                            <SearchButton bsStyle="primary" bsSize="xsmall" search={filter} onSearch={filter=>{setFilter(filter)}} placement="bottom"><Icon name="search"/></SearchButton>
                            <ButtonGroup style={{ float: 'right' }}>
                                <ColorPicker to="rgba" icon="pencil" bsSize="xsmall" disabled={!someSelected} onClick={v=>dispatch(colorDocumentSelected({strokeColor:v||[0,0,0,1], strokeColorHex: convert.rgb.hex(v.slice(0, 3).map(x => x * 255))||"000000" }))}/>
                                <ColorPicker to="rgba" icon="paint-brush" bsSize="xsmall" disabled={!someSelected} onClick={v=>dispatch(colorDocumentSelected({fillColor:v||[0,0,0,0], fillColorHex: convert.rgb.hex(v.slice(0, 3).map(x => x * 255))||"000000" }))}/>
                            </ButtonGroup>
                            </ButtonToolbar>:undefined}
                    </div>
                </Splitter>
                <Alert bsStyle="success" style={{ padding: "4px", marginBottom: 7 }}>
                    <table style={{ width: 100 + '%' }}>
                        <tbody>
                            <tr>
                                <th>GCODE</th>
                                <td style={{ width: "80%", textAlign: "right" }}>
                                    {!gcoding.processing ? (
                                    <ButtonToolbar style={{ float: "right" }}>
                                        <button title="Generate G-Code from Operations below" className={"btn btn-xs btn-attention " + (dirty ? 'btn-warning' : 'btn-primary')} disabled={gcodingEnable || !operations.length} onClick={(e) => generateGcode(e)}><i className="fa fa-fw fa-industry" />&nbsp;Generate</button>
                                        <ButtonGroup>
                                            <button title="View generated G-Code in a tab. Please disable popup blockers. Press [SHIFT] to avoid large file size confirmation and open in a new window." className="btn btn-info btn-xs" disabled={gcodingEnable || !gcode.length} onClick={viewGcode}><i className="fa fa-eye" /></button>
                                            <button title="Export G-code to File. Press [SHIFT] to edit filename." className="btn btn-success btn-xs" disabled={gcodingEnable || !gcode.length} onClick={saveGcode}><i className="fa fa-floppy-o" /></button>
                                            <FileField onChange={loadGcode} disabled={gcodingEnable} accept=".gcode,.gc,.nc">
                                                <button title="Load G-Code from File" className="btn btn-danger btn-xs" disabled={gcodingEnable} ><i className="fa fa-folder-open" /></button>
                                            </FileField>
                                        </ButtonGroup>
                                        <button title="Clear Current Gcode. Press [SHIFT] to avoid confirmation." className="btn btn-warning btn-xs" disabled={gcodingEnable} onClick={clearGcode}><i className="fa fa-trash" /></button>
                                    </ButtonToolbar>) : (
                                    <div style={{ display: "flex", flexDirection: "row" }}>
                                        <ProgressBar now={+gcoding.percent} active={gcoding.processing} label={`${gcoding.percent}%`} style={{ flexGrow: 1, marginBottom: "0px" }} />
                                        <Button onClick={stopGcode} bsSize="xs" bsStyle="danger">
                                            <Icon name="hand-paper-o" />
                                        </Button>
                                    </div>)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </Alert>
                <OperationDiagram {...{ operations, currentOperation }} />
                <Operations style={{ flexGrow: 2, display: "flex", flexDirection: "column" }} />
            </div>);
};
