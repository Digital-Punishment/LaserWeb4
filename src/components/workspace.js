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

import { mat2d, mat4, vec3, vec4 } from 'gl-matrix';
import React, { useContext, useEffect, useState, useRef } from 'react'
import { connect, useSelector, useDispatch } from 'react-redux'
import ReactDOM from 'react-dom';
import { useImmer } from "use-immer";

import '../styles/simbar.css';


import { GlobalStore } from '..';
import { selectDocument, toggleSelectDocument, transform2dSelectedDocuments, removeDocumentSelected, cloneDocumentSelected } from '../actions/document';
import { setSettingsAttrs } from '../actions/settings';

import { runCommand, jogTo } from './com.js';

import { DocumentCacheContext } from './document-cache'
import { Dom3d, Text3d } from './dom3d';
import { DrawCommands } from '../draw-commands'
import { parseGcodePreview, calcGcodePreview, drawGcodePreview } from '../draw-commands/GcodePreview'
import { CylImageMesh } from '../draw-commands/imageMesh'
import { parseLaserPreview, calcLaserPreview, drawLaserPreview } from '../draw-commands/LaserPreview'
import { convertOutlineToThickLines } from '../draw-commands/thick-lines'
import { Input } from './forms.js';
import SetSize from './setsize';
import { dist } from '../lib/cam';
import { parseGcode } from '../lib/tmpParseGcode';
import { clamp } from '../lib/helpers'
import { objectHasMatchingFields, sameArrayContent } from '../lib/util.js';

import CommandHistory from './command-history'

import { Button, ButtonToolbar, ButtonGroup } from 'react-bootstrap'
import Icon from './font-awesome'

import Draggable from 'react-draggable';

import { VideoPort } from './webcam'
import { ImagePort, ImageEditorButton } from './image-filters'

import { LiveJogging } from './jog'

import { useHotkeys } from 'react-hotkeys-hook';

import { arucoProcess } from '../lib/omr.js';
import { humanFileSize } from '../lib/helpers';
import convert from 'color-convert'

function calcCamera({ viewportWidth, viewportHeight, fovy, near, far, eye, center, up, showPerspective, machineX, machineY }) {
    let perspective;
    let view = mat4.lookAt([], eye, center, up);
    view = mat4.translate([], view, [-machineX, -machineY, 0]);
    if (showPerspective)
        perspective = mat4.perspective([], fovy, viewportWidth / viewportHeight, near, far);
    else {
        let yBound = vec3.distance(eye, center) * Math.tan(fovy / 2);
        perspective = mat4.identity([]);
        view = mat4.mul([],
            mat4.ortho([], -yBound * viewportWidth / viewportHeight, yBound * viewportWidth / viewportHeight, -yBound, yBound, near, far),
            view);
        fovy = 0;
    }
    let viewInv = mat4.invert([], view);
    return { fovy, perspective, view, viewInv };
}

const MAJOR_GRID_SPACING = 50;
const MINOR_GRID_SPACING = 10;
const CROSSHAIR = 5

function calcLightenMachineBounds(x, y, width, height) {
        const result = {};
            result.x = x;
            result.y = y;
            result.width = width;
            result.height = height;
            let x2 = x + width;
            let y2 = y + height;
            let a = [
                x, y, x2, y2, x, y2,
                x, y, x2, y, x2, y2,
            ];
            result.triangles = new Float32Array(a);
        return result;
};

function calcGrid(width, height, major = MAJOR_GRID_SPACING, minor = MINOR_GRID_SPACING) {
        const result = {};
            result.width = width;
            result.height = height;
            let a = [];
            let b = [];
            a.push(-result.width, -result.height, 0, result.width, -result.height, 0);
            a.push(-result.width, -result.height, 0, -result.width, result.height, 0);
            for (let x = minor; x < result.width; x += minor) {
                a.push(x, -result.height, 0, x, result.height, 0);
                a.push(-x, -result.height, 0, -x, result.height, 0);
                if (x % major === 0) {
                    b.push(x, -result.height, 0, x, result.height, 0);
                    b.push(-x, -result.height, 0, -x, result.height, 0);
                }
            }
            a.push(result.width, -result.height, 0, result.width, result.height, 0);
            for (let y = minor; y < result.height; y += minor) {
                a.push(-result.width, y, 0, result.width, y, 0);
                a.push(-result.width, -y, 0, result.width, -y, 0);
                if (y % major === 0) {
                    b.push(-result.width, y, 0, result.width, y, 0);
                    b.push(-result.width, -y, 0, result.width, -y, 0);
                }
            }
            a.push(-result.width, result.height, 0, result.width, result.height, 0);
            result.maingrid = new Float32Array(a);
            result.darkgrid = new Float32Array(b);
            result.maincount = a.length / 3;
            result.darkcount = b.length / 3;

            let c = [];
            c.push(-result.width, 0, 0, result.width, 0, 0);
            c.push(0, -result.height, 0, 0, result.height, 0);
            result.origin = new Float32Array(c);
            result.origincount = c.length / 3;
        return result;
};

function drawGrid(grid, drawCommands, camera, colors){
    let rgbx = [...convert.hex.rgb(colors.toolGridXColor)];
    let rgby = [...convert.hex.rgb(colors.toolGridYColor)];
    drawCommands.basic({
        perspective: camera.perspective,
        view: camera.view,
        position: grid.maingrid,
        offset: 0,
        count: grid.maincount,
        color: [0.7, 0.7, 0.7, 0.95],
        scale: [1, 1, 1],
        translate: [0, 0, 0],
        primitive: drawCommands.gl.LINES
    }); // Gray grid
    drawCommands.basic({
        perspective: camera.perspective,
        view: camera.view,
        position: grid.darkgrid,
        offset: 0, count: grid.darkcount,
        color: [0.5, 0.5, 0.5, 0.95],
        scale: [1, 1, 1],
        translate: [0, 0, 0],
        primitive: drawCommands.gl.LINES
    }); // Dark grid

    drawCommands.basic({
        perspective: camera.perspective,
        view: camera.view,
        position: grid.origin, offset: 0,
        count: 2,
        color: [rgbx[0]/255,rgbx[1]/255,rgbx[2]/255,1],
        scale: [1, 1, 1],
        translate: [0, 0, 0],
        primitive: drawCommands.gl.LINES
    }); //Axis X
    drawCommands.basic({
        perspective: camera.perspective,
        view: camera.view,
        position: grid.origin,
        offset: 2,
        count: 2,
        color: [rgby[0]/255,rgby[1]/255,rgby[2]/255,1],
        scale: [1, 1, 1],
        translate: [0, 0, 0],
        primitive: drawCommands.gl.LINES
    }); //Axis Y
};

function GridText(props) {
    let { minor = MINOR_GRID_SPACING, major = MAJOR_GRID_SPACING, width, height, xcolor, ycolor } = props;
    let size = Math.min(major / 3, 10)
    let a = [];
    for (let x = major; x <= width; x += major) {
        a.push(<Text3d key={'x' + x} x={x} y={-5} size={size} style={{ color: xcolor }} label={String(x)} />);
        a.push(<Text3d key={'x' + -x} x={-x} y={-5} size={size} style={{ color: xcolor }} label={String(-x)} />);
    }
    a.push(<Text3d key="x-label" x={width + 15} y={0} size={size} style={{ color: xcolor }}>X</Text3d>);
    for (let y = major; y <= height; y += major) {
        a.push(<Text3d key={'y' + y} x={-10} y={y} size={size} style={{ color: ycolor }} label={String(y)} />);
        a.push(<Text3d key={'y' + -y} x={-10} y={-y} size={size} style={{ color: ycolor }} label={String(-y)} />);
    }
    a.push(<Text3d key="y-label" x={0} y={height + 15} size={size} style={{ color: ycolor }}>Y</Text3d>);
    return <div>{a}</div>;
}

function calcMachineBounds(x, y, width, height) {
const markerOrthSize = 10;
const markerPointSize = 6;
        const result = {}
            result.x = x;
            result.y = y;
            result.width = width;
            result.height = height;
            let x2 = x + width;
            let y2 = y + height;
            let a = [
                x, y, x, y + markerOrthSize, x - markerPointSize, y - markerPointSize,
                x, y, x - markerPointSize, y - markerPointSize, x + markerOrthSize, y,
                x2, y, x2 + markerPointSize, y - markerPointSize, x2, y + markerOrthSize,
                x2, y, x2 - markerOrthSize, y, x2 + markerPointSize, y - markerPointSize,
                x2, y2, x2, y2 - markerOrthSize, x2 + markerPointSize, y2 + markerPointSize,
                x2, y2, x2 + markerPointSize, y2 + markerPointSize, x2 - markerOrthSize, y2,
                x, y2, x + markerOrthSize, y2, x - markerPointSize, y2 + markerPointSize,
                x, y2, x - markerPointSize, y2 + markerPointSize, x, y2 - markerOrthSize,
            ];
            result.markers = new Float32Array(a);
        return result;
};

class FloatingControls extends React.Component {

    constructor(props) {
        super(props)
        this.handleDrag = this.handleDrag.bind(this)
        this.handleStop = this.handleStop.bind(this)

        this.state = {
            linkScale: true,
            degrees: 45,
            drag: this.props.settings.uiFcDrag
        }
    }
    UNSAFE_componentWillMount() {

        this.linkScaleChanged = e => {
            this.setState({ linkScale: e.target.checked });
        }
        this.scale = (sx, sy, anchor = 'C') => {
            let cx, cy
            switch (anchor) {
                case 'TL':
                    cx = this.bounds.x1;
                    cy = this.bounds.y2;
                    break;
                case 'TR':
                    cx = this.bounds.x2;
                    cy = this.bounds.y2;
                    break;
                case 'BL':
                    cx = this.bounds.x1;
                    cy = this.bounds.y1;
                    break;
                case 'BR':
                    cx = this.bounds.x2;
                    cy = this.bounds.y1;
                    break;
                case 'C':
                    cx = (this.bounds.x1 + this.bounds.x2) / 2;
                    cy = (this.bounds.y1 + this.bounds.y2) / 2;
                    break;
            }
            this.props.dispatch(transform2dSelectedDocuments([sx, 0, 0, sy, cx - sx * cx, cy - sy * cy]));
        }

        this.setDegrees = degrees => {
            this.setState({ degrees })
        }

        this.rotate = (e, clockwise) => {
            let rotate = (this.state.degrees || 0) * ((clockwise) ? -1 : 1);
            this.props.dispatch(transform2dSelectedDocuments(
                mat2d.translate([],
                    mat2d.rotate(
                        [],
                        mat2d.fromTranslation([], [this.rotateCenter[0], this.rotateCenter[1]]),
                        rotate * Math.PI / 180),
                    [-this.rotateCenter[0], -this.rotateCenter[1]]
                )
            ));
            this.rotateDocs = GlobalStore().getState().documents;
            this.forceUpdate();
        }
        this.setMinX = v => {
            this.props.dispatch(transform2dSelectedDocuments([1, 0, 0, 1, v - this.bounds.x1, 0]));
        }
        this.setCenterX = v => {
            this.props.dispatch(transform2dSelectedDocuments([1, 0, 0, 1, v - (this.bounds.x1 + this.bounds.x2) / 2, 0]));
        }
        this.setMaxX = v => {
            this.props.dispatch(transform2dSelectedDocuments([1, 0, 0, 1, v - this.bounds.x2, 0]));
        }
        this.setZeroX = dir => {
            var x = -this.bounds.x1;
            if (dir)
                x -= this.bounds.x2 - this.bounds.x1;
            this.props.dispatch(transform2dSelectedDocuments([1, 0, 0, 1, x, 0]));
        }
        this.setSizeX = v => {
            if (v > 0 && this.bounds.x2 - this.bounds.x1 > 0) {
                let s = v / (this.bounds.x2 - this.bounds.x1);
                if (this.state.linkScale)
                    this.scale(s, s);
                else
                    this.scale(s, 1);
            }
        }
        this.setMinY = v => {
            this.props.dispatch(transform2dSelectedDocuments([1, 0, 0, 1, 0, v - this.bounds.y1]));
        }
        this.setCenterY = v => {
            this.props.dispatch(transform2dSelectedDocuments([1, 0, 0, 1, 0, v - (this.bounds.y1 + this.bounds.y2) / 2]));
        }
        this.setMaxY = v => {
            this.props.dispatch(transform2dSelectedDocuments([1, 0, 0, 1, 0, v - this.bounds.y2]));
        }
        this.setZeroY = dir => {
            var y = -this.bounds.y1;
            if (dir)
                y -= this.bounds.y2 - this.bounds.y1;
            this.props.dispatch(transform2dSelectedDocuments([1, 0, 0, 1, 0, y]));
        }
        this.setSizeY = v => {
            if (v > 0 && this.bounds.y2 - this.bounds.y1 > 0) {
                let s = v / (this.bounds.y2 - this.bounds.y1);
                if (this.state.linkScale)
                    this.scale(s, s);
                else
                    this.scale(1, s);
            }
        }
        this.setCenterXY = v => {
            let x = -this.bounds.x1;
            let y = -this.bounds.y1;
            let cx = (this.bounds.x2 - this.bounds.x1) / 2;
            let cy = (this.bounds.y2 - this.bounds.y1) / 2;
            this.props.dispatch(transform2dSelectedDocuments([1, 0, 0, 1, x - cx, y - cy]));

        }
        this.flipLeftRight = v => {
            this.scale(-1, 1)
        }
        this.flipTopBorrom = v => {
            this.scale(1, -1)
        }
        this.toolOptimize = (doc, scale, anchor = 'C') => {
            if (!scale) scale = 2540 / (this.props.settings.dpiBitmap * 100);
            if (doc.originalPixels) {
                let targetwidth = doc.originalPixels[0] * scale;
                let targetheight = doc.originalPixels[1] * scale;
                let height = this.bounds.y2 - this.bounds.y1;
                let width = this.bounds.x2 - this.bounds.x1;
                this.scale(targetwidth / width, targetheight / height, anchor)
            }
        }
    }

    handleDrag(e, ui) {
        const { x, y } = this.state.drag || { x: 0, y: 0 };
        this.setState({
            drag: {
                x: x + ui.deltaX,
                y: y + ui.deltaY,
            }
        });
    }

    handleStop(e) {
        this.props.dispatch(setSettingsAttrs({ uiFcDrag: this.state.drag }))
    }

    render() {
        let tools;
        let found = false;
        let bounds = this.bounds = { x1: Number.MAX_VALUE, y1: Number.MAX_VALUE, x2: -Number.MAX_VALUE, y2: -Number.MAX_VALUE };
        for (let cache of this.props.documentCacheHolder.values()) {
            let doc = cache.document;
            if (doc.selected && doc.transform2d && cache.bounds) {
                found = true;
                bounds.x1 = Math.min(bounds.x1, cache.bounds.x1 + doc.transform2d[4]);
                bounds.y1 = Math.min(bounds.y1, cache.bounds.y1 + doc.transform2d[5]);
                bounds.x2 = Math.max(bounds.x2, cache.bounds.x2 + doc.transform2d[4]);
                bounds.y2 = Math.max(bounds.y2, cache.bounds.y2 + doc.transform2d[5]);

                if (doc.type == 'image' && doc.originalPixels) {
                    tools = <tfoot>
                        <tr>
                            <td><Icon name="gear" /></td><td colSpan="7" >
                                <ButtonGroup>
                                    <Button bsSize="xs" bsStyle="warning" onClick={(e) => this.toolOptimize(doc, this.props.settings.machineBeamDiameter, this.props.settings.toolImagePosition)}><Icon name="picture-o" /> Raster Opt.</Button>
                                    <Button bsSize="xs" bsStyle="danger" onClick={(e) => this.toolOptimize(doc, null, this.props.settings.toolImagePosition)}><Icon name="undo" /></Button>
                                </ButtonGroup>
                                &nbsp;<ImageEditorButton bsSize="xs"><Icon name="code" /> Filters/Trace</ImageEditorButton>
                            </td>
                        </tr>
                    </tfoot>
                }
            }
        }


        if (this.rotateDocs !== this.props.documents) {
            this.baseRotate = 0;
            this.rotateCenter = [(bounds.x1 + bounds.x2) / 2, (bounds.y1 + bounds.y2) / 2, 0];
            this.rotateDocs = this.props.documents;
        }

        let p =
            vec4.transformMat4([],
                vec4.transformMat4([], [bounds.x1, bounds.y1, 0, 1], this.props.camera.view),
                this.props.camera.perspective);
        let x = (p[0] / p[3] + 1) * this.props.workspaceWidth / 2 - 20 - this.props.width;
        let y = this.props.workspaceHeight - (p[1] / p[3] + 1) * this.props.workspaceHeight / 2 + 20;



        let round = n => Math.round(n * 100) / 100;
        let hidden = !found || !this.props.camera;


        if (hidden) bounds.x1 = bounds.x2 = bounds.y1 = bounds.y2 = 0


        const detach = (e, ui) => {
            if (!this.state.drag)
                this.setState({ drag: { x, y } });
        }

        const reattach = (e) => {
            this.props.dispatch(setSettingsAttrs({ uiFcDrag: null }))
            this.setState({ drag: null });
        }

        const constraint = (point) => {
            return {
                x: Math.min(Math.max(point.x, 0), this.props.workspaceWidth - this.props.width),
                y: Math.min(Math.max(point.y, 0), this.props.workspaceHeight - this.props.height)
            }
        }

        return (
            <Draggable bounds="parent" position={constraint(this.state.drag ? this.state.drag : { x, y })} onStart={detach} onStop={this.handleStop} onDrag={this.handleDrag} disabled={hidden} handle=".handle">
                <div style={{ position: "absolute", pointerEvents: hidden ? 'none' : 'all', display: hidden ? 'none' : 'block' }}>
                    <table style={{ border: '2px solid #ccc', margin: '1px', padding: '2px', backgroundColor: '#eee', }} className="floating-controls" >
                        <tbody>
                            <tr>
                                <td title="Drag to position. DblClick to restore"><span className="handle" onDoubleClick={reattach} style={{ color: this.state.drag ? '#00F' : '#000' }}><Icon name="arrows" /></span></td>
                                <td>Min</td>
                                <td>Center</td>
                                <td>Max</td>
                                <td>Size</td>
                                <td></td>
                                <td>Rot</td>
                                <td rowSpan={3} className="origin-controls">
                                    <table>
                                    <tbody>
                                    <tr>
                                    <td><button className="btn btn-xs" onClick={ e => { this.setZeroX(true); this.setZeroY(false); } } title="Align northwest of origin">&#x2198;</button></td>
                                    <td><button className="btn btn-xs" onClick={ e => this.setZeroY(false) } title="Align north of origin">&#x2193;</button></td>
                                    <td><button className="btn btn-xs" onClick={ e => { this.setZeroX(false); this.setZeroY(false); } } title="Align northeast of origin">&#x2199;</button></td>
                                    </tr>
                                    <tr>
                                    <td><button className="btn btn-xs" onClick={ e => this.setZeroX(true) } title="Align west of origin">&#x2192;</button></td>
                                    <td><button className="btn btn-xs" onClick={ e => this.setCenterXY() } title="Center on origin">+</button></td>
                                    <td><button className="btn btn-xs" onClick={ e => this.setZeroX(false) } title="Align east of origin">&#x2190;</button></td>
                                    </tr>
                                    <tr>
                                    <td><button className="btn btn-xs" onClick={ e => { this.setZeroX(true); this.setZeroY(true); } } title="Align southwest of origin">&#x2197;</button></td>
                                    <td><button className="btn btn-xs" onClick={ e => this.setZeroY(true) } title="Align south of origin">&#x2191;</button></td>
                                    <td><button className="btn btn-xs" onClick={ e => { this.setZeroX(false); this.setZeroY(true); } } title="Align southeast of origin">&#x2196;</button></td>
                                    </tr>
                                    </tbody>
                                    </table>
                                </td>
                            </tr>
                            <tr>
                                <td><span className="label label-danger">X</span></td>
                                <td><Input value={round(bounds.x1)} onChangeValue={this.setMinX} type="number" step="any" tabIndex="1" /></td>
                                <td><Input value={round((bounds.x1 + bounds.x2) * .5)} onChangeValue={this.setCenterX} type="number" step="any" tabIndex="3" /></td>
                                <td><Input value={round(bounds.x2)} type="number" onChangeValue={this.setMaxX} step="any" tabIndex="5" /></td>
                                <td><Input value={round(bounds.x2 - bounds.x1)} type="number" onChangeValue={this.setSizeX} step="any" tabIndex="7" /></td>
                                <td rowSpan={2}>
                                    &#x2511;<br /><input type="checkbox" checked={this.state.linkScale} onChange={this.linkScaleChanged} tabIndex="10" /><br />&#x2519;
                                </td>
                                <td rowSpan={2}><Input value={round(this.state.degrees)} onChangeValue={this.setDegrees} type="angle" step="any" tabIndex="10" />
                                    <span style={{ fontSize: '120%', fontWeight: 'bold' }}>&nbsp;&deg;</span><br />
                                    <ButtonGroup>
                                        <Button bsSize="xsmall" onClick={e => this.rotate(e, false)} bsStyle="info"><Icon fw name="rotate-left"  /></Button>
                                        <Button bsSize="xsmall" onClick={e => this.rotate(e, true )} bsStyle="info"><Icon fw name="rotate-right" /></Button>
                                    </ButtonGroup>
                                    <br />
                                    <ButtonGroup>
                                        <Button bsSize="xsmall" onClick={e => this.flipTopBorrom()} bsStyle="info"><Icon fw name="arrows-v" /></Button>
                                        <Button bsSize="xsmall" onClick={e => this.flipLeftRight()} bsStyle="info"><Icon fw name="arrows-h" /></Button>
                                    </ButtonGroup>
                                </td>
                            </tr>
                            <tr>
                                <td><span className="label label-success">Y</span></td>
                                <td><Input value={round(bounds.y1)} onChangeValue={this.setMinY} type="number" step="any" tabIndex="2" /></td>
                                <td><Input value={round((bounds.y1 + bounds.y2) * .5)} onChangeValue={this.setCenterY} type="number" step="any" tabIndex="4" /></td>
                                <td><Input value={round(bounds.y2)} type="number" onChangeValue={this.setMaxY} step="any" tabIndex="6" /></td>
                                <td><Input value={round(bounds.y2 - bounds.y1)} type="number" onChangeValue={this.setSizeY} step="any" tabIndex="8" /></td>
                            </tr>
                        </tbody>
                        {tools}
                    </table>
                </div>
            </Draggable>
        );
    }
} // FloatingControls

const thickSquare = convertOutlineToThickLines([0, 0, 1, 0, 1, 1, 0, 1, 0, 0]);
const m4Identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function cacheDrawing(fn, oldState, setState, args) {
    let { drawCommands, width, height } = args;
    let state = {...oldState};
    if (!objectHasMatchingFields(state, args)) {
        for (let key in args)
            if (args.hasOwnProperty(key))
                state[key] = args[key];
        if (!state.frameBuffer)
            state.frameBuffer = drawCommands.createFrameBuffer(width, height);
        else
            state.frameBuffer.resize(width, height);
        drawCommands.useFrameBuffer(state.frameBuffer, () => {
            drawCommands.gl.clearColor(1, 1, 1, 0);
            drawCommands.gl.clear(drawCommands.gl.COLOR_BUFFER_BIT | drawCommands.gl.DEPTH_BUFFER_BIT);
            fn(args);
        });
        setState(state);
    }
    drawCommands.image({
        perspective: m4Identity, view: m4Identity, texture: state.frameBuffer.texture, selected: false,
        transform2d: [2 / width, 0, 0, -2 / height, -1, 1],
    });
}

export function drawDocument(perspective, view, drawCommands, cachedDocument, createTextures) {
    let { document } = cachedDocument;
    if (document.rawPaths) {
        if (document.fillColor[3] && cachedDocument.triangles.length)
            drawCommands.basic2d({
                perspective, view,
                position: cachedDocument.triangles,
                transform2d: document.transform2d,
                color: document.fillColor,
                primitive: drawCommands.gl.TRIANGLES,
                offset: 0,
                count: cachedDocument.triangles.length / 2,
            });
        if (document.strokeColor[3] || !cachedDocument.triangles.length)
            for (let o of cachedDocument.outlines)
                drawCommands.basic2d({
                    perspective, view,
                    position: o,
                    transform2d: document.transform2d,
                    color: document.strokeColor[3] ? document.strokeColor : [1, 0, 0, 1],
                    primitive: drawCommands.gl.LINE_STRIP,
                    offset: 0,
                    count: o.length / 2,
                });
    } else if (document.type === 'image') {
        if (cachedDocument.image) {
            let texture;
            if (createTextures)
                texture = drawCommands.createTexture({ image: cachedDocument.image });
            else if (cachedDocument.texture && cachedDocument.drawCommands === drawCommands)
                texture = cachedDocument.texture;
            if (texture)
                drawCommands.image({
                    perspective, view,
                    transform2d: document.transform2d,
                    texture,
                    selected: false,
                });
        }
    }
} // drawDocument

function drawDocuments({ perspective, view, drawCommands, documentsCache }) {
    for (let cachedDocument of documentsCache.values())
        if (cachedDocument.document.visible)
            drawDocument(perspective, view, drawCommands, cachedDocument, false);
}

function drawSelectedDocuments({ perspective, view, drawCommands, documentsCache }) {
    for (let cachedDocument of documentsCache.values()) {
        let { document } = cachedDocument;
        if (!document.selected)
            continue;
        if (document.rawPaths) {
            for (let outline of cachedDocument.thickOutlines) {
                drawCommands.thickLines({
                    perspective, view,
                    buffer: outline,
                    transform2d: document.transform2d,
                    thickness: 5,
                    color1: [0, 0, 1, 1],
                    color2: [1, 1, 1, 1],
                });
            }
        } else if (document.type === 'image') {
            if (cachedDocument.image && cachedDocument.texture && cachedDocument.drawCommands === drawCommands)
                drawCommands.thickLines({
                    perspective, view,
                    buffer: thickSquare,
                    transform2d: mat2d.mul([], document.transform2d, [cachedDocument.image.width, 0, 0, cachedDocument.image.height, 0, 0]),
                    thickness: 5,
                    color1: [0, 0, 1, 1],
                    color2: [1, 1, 1, 1],
                });
        }
    }
} // drawSelectedDocuments

function drawDocumentsHitTest(perspective, view, drawCommands, documentsCache) {
    for (let cachedDocument of documentsCache.values()) {
        let { document, hitTestId } = cachedDocument;
        let color = [((hitTestId >> 24) & 0xff) / 0xff, ((hitTestId >> 16) & 0xff) / 0xff, ((hitTestId >> 8) & 0xff) / 0xff, (hitTestId & 0xff) / 0xff];
        if (document.rawPaths) {
            if (document.visible !== false) {
                if (document.fillColor[3])
                    drawCommands.basic2d({
                        perspective, view,
                        position: cachedDocument.triangles,
                        transform2d: document.transform2d,
                        color,
                        primitive: drawCommands.gl.TRIANGLES,
                        offset: 0,
                        count: cachedDocument.triangles.length / 2,
                    });
                for (let o of cachedDocument.thickOutlines)
                    drawCommands.thickLines({
                        perspective, view,
                        buffer: o,
                        transform2d: document.transform2d,
                        thickness: 10,
                        color1: color,
                        color2: color,
                    })
            }
        } else if (document.type === 'image' && cachedDocument.image && cachedDocument.texture && cachedDocument.drawCommands === drawCommands) {
            if (document.visible !== false) {
                let w = cachedDocument.image.width;
                let h = cachedDocument.image.height;
                drawCommands.basic2d({
                    perspective, view,
                    position: new Float32Array([0, 0, w, 0, w, h, w, h, 0, h, 0, 0]),
                    transform2d: document.transform2d,
                    color,
                    primitive: drawCommands.gl.TRIANGLES,
                    offset: 0,
                    count: 6,
                });
            }
        }
    }
}

function initCursor() {
    let numSides = 10;
    let a = [];
    for (let i = 0; i < numSides; ++i)
        a.push(
            0, 0, 0,
            Math.cos(i * Math.PI * 2 / numSides) / 2,
            Math.sin(i * Math.PI * 2 / numSides) / 2,
            1,
            Math.cos((i + 1) * Math.PI * 2 / numSides) / 2,
            Math.sin((i + 1) * Math.PI * 2 / numSides) / 2,
            1,
        );
    return new Float32Array(a);
}
const cursor = initCursor();

function drawCursor(perspective, view, drawCommands, cursorPos) {
    let height = 30;
    let diameter = 10;
    drawCommands.basic({
        perspective,
        view,
        scale: new Float32Array([diameter, diameter, height]),
        translate: new Float32Array(cursorPos),
        color: new Float32Array([0, 0, 1, .5]),
        primitive: drawCommands.gl.TRIANGLES,
        position: cursor,
        offset: 0,
        count: cursor.length / 3,
    });
}

function WorkspaceContent ({width, height, camera, updateCamera, zoomArea, workspace, updateWorkspace, parsedGcode, parsedLaser}) {

    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [hotkeysEnabled, setHotkeysEnabled] = useState(false);

    const dispatch = useDispatch();
    const settings = useSelector((state) => state.settings);
    const documents = useSelector((state) => state.documents);
    const mode = useSelector((state) => state.panes.selected);
    const gcode = useSelector((state) => state.gcode);
    const com = useSelector((state) => state.com);

    const {documentsCache, cacheDrawCommands, setCacheDrawCommands, numImagesLoaded} = useContext(DocumentCacheContext);

    const [viewCamera, setViewCamera] = useState(setCamera());
    const [drawDocs, setDrawDocs] = useState({});
    const [drawGcode, setDrawGcode] = useState({});
    const [drawSelDocs, setDrawSelDocs] = useState({});

    const [lightenMachineBounds, setLightenMachineBounds] = useState(calcLightenMachineBounds (0, 0, 0, 0));
    const [grid, setGrid] = useState(calcGrid(0, 0, MAJOR_GRID_SPACING, MINOR_GRID_SPACING));
    const [machineBounds, setMachineBounds] = useState(calcMachineBounds(0, 0, 0, 0));

    const [gcodePreview, setGcodePreview] = useState();
    const [laserPreview, setLaserPreview] = useState();

    const [rotaryFrameBuffer, setRotaryFrameBuffer] = useState();
    const [cylImageMesh, setCylImageMesh] = useState();
    const [hitTestFrameBuffer, setHitTestFrameBuffer] = useState();

    const [pointers, updatePointers] = useImmer([]);
    const [fingers, setFingers] = useState(null);
    const [pointerFlags, updatePointerFlags] = useImmer({movingObjects: false, adjustingCamera: false, moveStarted: false, needToSelect: null})

    const canvasRef = useRef(null);

    useEffect(() => {
        let machineX = settings.machineBottomLeftX - com.workOffsetX;
        let machineY = settings.machineBottomLeftY - com.workOffsetY;
        setLightenMachineBounds(calcLightenMachineBounds(machineX, machineY, settings.machineWidth, settings.machineHeight));
        setGrid(calcGrid(settings.toolGridWidth, settings.toolGridHeight, Math.max(settings.toolGridMajorSpacing,1), Math.max(settings.toolGridMinorSpacing,0.1)));
        setMachineBounds(calcMachineBounds(machineX, machineY, settings.machineWidth, settings.machineHeight));
    }, [settings, workspace]);

    useEffect(() => {
        if (!cacheDrawCommands)
            return
        let {drawCommands} = cacheDrawCommands;
        setGcodePreview(calcGcodePreview(parsedGcode, drawCommands));
    }, [parsedGcode, cacheDrawCommands]);

    useEffect(() => {
        if (!cacheDrawCommands)
            return
        let {drawCommands} = cacheDrawCommands;
        setLaserPreview(calcLaserPreview(parsedLaser, drawCommands));
    }, [parsedLaser, cacheDrawCommands]);

    useEffect(() => {
        if (cacheDrawCommands && settings.machineAEnabled) {
            if (!cylImageMesh)
                setCylImageMesh(new CylImageMesh());
            let {drawCommands} = cacheDrawCommands;
            if (!rotaryFrameBuffer)
                setRotaryFrameBuffer(drawCommands.createFrameBuffer(dimensions.width, dimensions.height));
            else
                rotaryFrameBuffer.resize(dimensions.width, dimensions.height);
        }
    }, [dimensions, settings]);

    useEffect(() =>{
        setViewCamera(setCamera());
    }, [dimensions, camera, settings]);

    const hotkeysOptions = {enabled: hotkeysEnabled, preventDefault: true,};
    useHotkeys(['alt+delete', 'meta+backspace'], () => removeSelected(), hotkeysOptions);
    useHotkeys(['control+d'], () => cloneSelected(), hotkeysOptions);

    function removeSelected() {
        if (mode === 'jog') return;
        if (documents.find((d) => (d.selected)))
            dispatch(removeDocumentSelected());
    }

    function cloneSelected() {
        if (mode === 'jog') return;
        if (documents.find((d) => (d.selected)))
            dispatch(cloneDocumentSelected());
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;

        let gl = canvas.getContext('webgl', { alpha: true, depth: true, antialias: true, preserveDrawingBuffer: true });
        let drawCommands = new DrawCommands(gl)
        setCacheDrawCommands({canvas, gl, drawCommands});
        setHitTestFrameBuffer(drawCommands.createFrameBuffer(canvas.width, canvas.height));
    },[]);

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height });
            updateWorkspace((draft) => {
                    draft.width = width;
                    draft.height = height;
                    });

                if (!workspace.initialZoom) {
                    let x = settings.machineBottomLeftX;
                    let y = settings.machineBottomLeftY;
                    if (settings.showMachine) {
                        x = 0;
                        y = 0;
                    }
                    updateWorkspace((draft) => {draft.inititalZoom = true });
                    zoomArea(
                        x - 10,
                        y - 10,
                        x + settings.machineWidth + 10,
                        y + settings.machineHeight + 10
                    );
                }
        });

        if (canvasRef.current)
            observer.observe(canvasRef.current);

        return () => {
            observer.disconnect();
        };
    }, []);

    const shouldComponentUpdate = [
        dimensions,
        settings,
        workspace,
        viewCamera,
        lightenMachineBounds,
        grid,
        machineBounds,
        gcodePreview,
        laserPreview,
        documentsCache,
        cacheDrawCommands,
        numImagesLoaded,
        rotaryFrameBuffer,
    ]

    useEffect(() => {
        let draw = () => {
            if (!cacheDrawCommands)
                return
            let {canvas, gl, drawCommands} = cacheDrawCommands;

            gl.viewport(0, 0, canvas.width, canvas.height);
            if (settings.showMachine || settings.machineAEnabled && workspace.showRotary) {
                let rgb = [...convert.hex.rgb(settings.workSpaceColor)];
                gl.clearColor(rgb[0]/255,rgb[1]/255,rgb[2]/255,1);
            } else {
                let rgb = [...convert.hex.rgb(settings.workBedColor)];
                gl.clearColor(rgb[0]/255,rgb[1]/255,rgb[2]/255,1);
            }

            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.enable(gl.BLEND);

            if (settings.machineAEnabled && workspace.showRotary)
                drawRotary(canvas, gl, drawCommands);
            else
                drawFlat(canvas, gl, drawCommands);
        };
        draw();

    }, shouldComponentUpdate);

    function drawFlat(canvas, gl, drawCommands) {

        //draw lightenMachineBounds
        if (settings.showMachine) {
            gl.clearDepth(1);
            let rgb = [...convert.hex.rgb(settings.workBedColor)];
            drawCommands.basic2d({
                perspective: viewCamera.perspective,
                view: viewCamera.view,
                position: lightenMachineBounds.triangles,
                offset: 0,
                count: lightenMachineBounds.triangles.length / 2,
                color: [rgb[0]/255,rgb[1]/255,rgb[2]/255,1],
                transform2d: [1, 0, 0, 1, 0, 0],
                primitive: drawCommands.gl.TRIANGLES
            });
            gl.clearDepth(1);
        }

        //Draw grid
        drawGrid(grid, drawCommands, viewCamera, {toolGridXColor: settings.toolGridXColor, toolGridYColor: settings.toolGridYColor})

        //Draw machineBounds
        if (settings.showMachine) {
            drawCommands.basic2d({
                perspective: viewCamera.perspective,
                view: viewCamera.view,
                position: machineBounds.markers,
                offset: 0,
                count: machineBounds.markers.length / 2,
                color: [0, 0, 0, 0.8],
                transform2d: [1, 0, 0, 1, 0, 0],
                primitive: drawCommands.gl.TRIANGLES
            });
        };

        //Draw Documents
        if (workspace.showDocuments)
            cacheDrawing(drawDocuments, drawDocs, setDrawDocs, {
                drawCommands,
                width: canvas.width,
                height: canvas.height,
                perspective: viewCamera.perspective,
                view: viewCamera.view,
                documents,
                documentsCache,
                numImagesLoaded,
            });

        if (gcodePreview && laserPreview){
            //Draw Laser(Tool)
            if (workspace.showLaser && laserPreview.buffer) {
                gl.blendEquation(drawCommands.EXT_blend_minmax.MIN_EXT);
                gl.blendFunc(gl.ONE, gl.ONE);
                drawLaserPreview(
                    laserPreview,
                    drawCommands,
                    viewCamera.perspective,
                    viewCamera.view,
                    settings.machineBeamDiameter,
                    settings.gcodeSMaxValue,
                    settings.simG0Rate,
                    workspace.simTime,
                    settings.machineAAxisDiameter);
                gl.blendEquation(gl.FUNC_ADD);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            }

            //Draw GCode
            if (workspace.showGcode && gcodePreview.buffer) {
                let draw = () => {
                    drawGcodePreview(
                        gcodePreview,
                        drawCommands,
                        viewCamera.perspective,
                        viewCamera.view,
                        settings.simG0Rate,
                        workspace.simTime,
                        settings.machineAAxisDiameter);
                };
                cacheDrawing(draw, drawGcode, setDrawGcode, {
                    drawCommands,
                    width: canvas.width,
                    height: canvas.height,
                    perspective: viewCamera.perspective,
                    view: viewCamera.view,
                    g0Rate: settings.simG0Rate,
                    simTime: workspace.simTime,
                    rotaryDiameter: settings.machineAAxisDiameter,
                    arrayVersion: gcodePreview.arrayVersion,
                });
            }
        }

        //Draw Selected Documents
        if (workspace.showDocuments)
            cacheDrawing(drawSelectedDocuments, drawSelDocs, setDrawSelDocs, {
                drawCommands,
                width: canvas.width,
                height: canvas.height,
                perspective: viewCamera.perspective,
                view: viewCamera.view,
                documents,
                documentsCache,
                numImagesLoaded,
            });

        //Draw cursor
        if (workspace.showCursor)
            drawCursor(viewCamera.perspective, viewCamera.view, drawCommands, com.cursorPos);
    };

    function drawRotary(canvas, gl, drawCommands) {

        let minX = Number.MAX_VALUE;
        let maxX = Number.MIN_VALUE;
        let minY = Number.MAX_VALUE;
        let maxY = Number.MIN_VALUE;

        if (gcodePreview.array && laserPreview.array) {
            if (workspace.showGcode || workspace.showLaser) {
                minX = Math.min(minX, gcodePreview.minX - settings.machineBeamDiameter);
                maxX = Math.max(maxX, gcodePreview.maxX + settings.machineBeamDiameter);
                minY = Math.min(minY, gcodePreview.minY + gcodePreview.minA * settings.machineAAxisDiameter * Math.PI / 360 - settings.machineBeamDiameter);
                maxY = Math.max(maxY, gcodePreview.maxY + gcodePreview.maxA * settings.machineAAxisDiameter * Math.PI / 360 + settings.machineBeamDiameter);
            }
        }

        if (maxX < minX) {
            minX = 0;
            maxX = 200;
        }
        if (maxY < minY) {
            minY = 0;
            maxY = 100;
        }

        drawCommands.useFrameBuffer(rotaryFrameBuffer, () => {
            let rgb = [...convert.hex.rgb(settings.workBedColor)];
            gl.clearColor(rgb[0]/255,rgb[1]/255,rgb[2]/255,1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            let perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
            let sx = 2 / (maxX - minX);
            let sy = 2 / Math.PI / settings.machineAAxisDiameter;
            let band = (minY, maxY, f) => {
                let n = 0;
                for (let i = Math.floor(minY / Math.PI / settings.machineAAxisDiameter); ; ++i) {
                    let y = i * Math.PI * settings.machineAAxisDiameter;
                    if (y >= maxY)
                        break;
                    let view = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, -minX * sx - 1, -y * sy - 1, 0, 1];
                    f(view);
                    if (++n >= 10)
                        break;
                }
            };

            if (gcodePreview && laserPreview) {
                if (workspace.showLaser && laserPreview.buffer) {
                    band(
                        gcodePreview.minY - settings.machineBeamDiameter,
                        gcodePreview.maxY + settings.machineBeamDiameter,
                        view => {
                            gl.blendEquation(drawCommands.EXT_blend_minmax.MIN_EXT);
                            gl.blendFunc(gl.ONE, gl.ONE);
                            drawLaserPreview(
                                laserPreview,
                                drawCommands,
                                perspective,
                                view,
                                settings.machineBeamDiameter,
                                settings.gcodeSMaxValue,
                                settings.simG0Rate,
                                workspace.simTime,
                                settings.machineAAxisDiameter);
                            gl.blendEquation(gl.FUNC_ADD);
                            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                        });
                }
                if (workspace.showGcode && gcodePreview.buffer) {
                    band(
                        gcodePreview.minY - settings.machineBeamDiameter,
                        gcodePreview.maxY + settings.machineBeamDiameter,
                        view => {
                            drawGcodePreview(
                                gcodePreview,
                                drawCommands,
                                perspective,
                                view,
                                settings.simG0Rate,
                                workspace.simTime,
                                settings.machineAAxisDiameter);
                        });
                }
            }
        });

        //Draw grid
        gl.clear(gl.DEPTH_BUFFER_BIT);
        drawGrid(grid, drawCommands, viewCamera, {toolGridXColor: settings.toolGridXColor, toolGridYColor: settings.toolGridYColor})

        //Draw rotary cylinder
        if (settings.machineAAxisDiameter > 0 && cylImageMesh) {
            gl.enable(gl.DEPTH_TEST);
            cylImageMesh.draw(drawCommands, viewCamera.perspective, viewCamera.view, minX, maxX, settings.machineAAxisDiameter, 360, rotaryFrameBuffer.texture);
            gl.disable(gl.DEPTH_TEST);
        }

        //Draw cursor
        if (workspace.showCursor)
            drawCursor(viewCamera.perspective, viewCamera.view, drawCommands, com.cursorPos);
    };

    function setCamera() {
        let newCamera =
            calcCamera({
                viewportWidth: dimensions.width,
                viewportHeight: dimensions.height,
                fovy: camera.fovy,
                near: .1,
                far: 2000,
                eye: camera.eye,
                center: camera.center,
                up: camera.up,
                showPerspective: camera.showPerspective,
                machineX: settings.machineBottomLeftX - com.workOffsetX,
                machineY: settings.machineBottomLeftY - com.workOffsetY,
            });
        return newCamera;
    }

    function rayFromPoint(pageX, pageY) {
        let r = ReactDOM.findDOMNode(cacheDrawCommands.canvas).getBoundingClientRect();
        let x = 2 * (pageX - r.left) / (dimensions.width) - 1;
        let y = -2 * (pageY - r.top) / (dimensions.height) + 1;
        if (camera.showPerspective) {
            let cursor = [x * dimensions.width / dimensions.height * Math.tan(viewCamera.fovy / 2), y * Math.tan(viewCamera.fovy / 2), -1];
            let origin = vec3.transformMat4([], [0, 0, 0], viewCamera.viewInv);
            let direction = vec3.sub([], vec3.transformMat4([], cursor, viewCamera.viewInv), origin);
            return { origin, direction };
        } else {
            let cursor = vec3.transformMat4([], [x, y, -1], viewCamera.viewInv);
            let origin = vec3.transformMat4([], [x, y, 0], viewCamera.viewInv);
            let direction = vec3.sub([], cursor, origin);
            return { origin, direction };
        }
    }

    function xyInterceptFromPoint(pageX, pageY) {
        if (!cacheDrawCommands || !viewCamera || !dimensions)
            return
        let { origin, direction } = rayFromPoint(pageX, pageY);
        if (!direction[2])
            return;
        let t = -origin[2] / direction[2];
        return [origin[0] + t * direction[0], origin[1] + t * direction[1], 0];
    }

    function hitTest(pageX, pageY) {
        if (!cacheDrawCommands || !workspace.showDocuments)
            return;
        if (settings.machineAEnabled && workspace.showRotary)
            return;
        let result;
        hitTestFrameBuffer.resize(cacheDrawCommands.canvas.width, cacheDrawCommands.canvas.height);
        cacheDrawCommands.drawCommands.useFrameBuffer(hitTestFrameBuffer, () => {
            let { gl } = cacheDrawCommands.drawCommands;
            gl.clearColor(1, 1, 1, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.BLEND);
            let r = ReactDOM.findDOMNode(cacheDrawCommands.canvas).getBoundingClientRect();
            let x = Math.round((pageX - r.left) * window.devicePixelRatio);
            let y = Math.round((dimensions.height - pageY + r.top) * window.devicePixelRatio);
            if (x >= 0 && x < cacheDrawCommands.canvas.width && y >= 0 && y < cacheDrawCommands.canvas.height) {
                drawDocumentsHitTest(viewCamera.perspective, viewCamera.view, cacheDrawCommands.drawCommands, documentsCache);
                let pixel = new Uint8Array(4);
                gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                let hitTestId = (pixel[0] << 24) | (pixel[1] << 16) | (pixel[2] << 8) | pixel[3];
                for (let cachedDocument of documentsCache.values()){
                    if (cachedDocument.hitTestId === hitTestId)
                        result = cachedDocument;
            }}
        });
        return result;
    }

    function zoom(pageX, pageY, amount) {
        if (!cacheDrawCommands)
            return
        let r = ReactDOM.findDOMNode(cacheDrawCommands.canvas).getBoundingClientRect();
        let newFovy = Math.max(.02, Math.min(Math.PI - .02, camera.fovy * amount));
        let oldScale = vec3.distance(camera.eye, camera.center) * Math.tan(camera.fovy / 2) / (r.height / 2);
        let newScale = vec3.distance(camera.eye, camera.center) * Math.tan(newFovy / 2) / (r.height / 2);
        let dx = Math.round(pageX - (r.left + r.right) / 2) * (newScale - oldScale);
        let dy = Math.round(-pageY + (r.top + r.bottom) / 2) * (newScale - oldScale);
        let adjX = vec3.scale([], vec3.cross([], vec3.normalize([], vec3.sub([], camera.center, camera.eye)), camera.up), -dx);
        let adjY = vec3.scale([], camera.up, -dy);
        let adj = vec3.add([], adjX, adjY);
        updateCamera((draft) => {
            draft.eye = vec3.add([], camera.eye, adj);
            draft.center = vec3.add([], camera.center, adj);
            draft.fovy = newFovy;
        });
    }

    function onPointerDown(e) {
        e.preventDefault();
        e.target.setPointerCapture(e.pointerId);
        if (pointers.length && e.pointerType !== pointers[0].pointerType)
            updatePointers([]);
        updatePointers((draft) => {draft.push({ pointerId: e.pointerId, pointerType: e.pointerType, button: e.button, pageX: e.pageX, pageY: e.pageY, origPageX: e.pageX, origPageY: e.pageY })});
        setFingers(null);
        updatePointerFlags((draft) => {
            draft.movingObjects = false;
            draft.adjustingCamera = false;
            draft.needToSelect = null;
            draft.moveStarted = false;
        });

        if (LiveJogging.isEnabled() && (e.altKey || e.metaKey) && mode == 'jog') {
            let [jogX, jogY] = xyInterceptFromPoint(e.pageX, e.pageY);
            let machineX = settings.machineBottomLeftX - com.workOffsetX;
            let machineY = settings.machineBottomLeftY - com.workOffsetY;
            jogX = Math.floor(clamp(jogX, machineX, settings.machineWidth - com.workOffsetX))
            jogY = Math.floor(clamp(jogY, machineY, settings.machineHeight - com.workOffsetY))
            let jogF = settings.jogFeedXY * ((settings.toolFeedUnits === 'mm/min') ? 1 : 60);
            CommandHistory.warn(`Live Jogging X${jogX} Y${jogY} F${jogF}`)
            return jogTo(jogX, jogY, undefined, 0, jogF)
        }

        let cachedDocument = hitTest(e.pageX, e.pageY);
        if (cachedDocument && e.button === 0 && mode !== 'jog') {
            updatePointerFlags((draft) => {draft.movingObjects = true});
            if (cachedDocument.document.selected){
                updatePointerFlags((draft) => {draft.needToSelect = cachedDocument.document.id});
            } else {
                if (e.ctrlKey || e.shiftKey){
                    dispatch(toggleSelectDocument(cachedDocument.id));
                } else{
                    dispatch(selectDocument(cachedDocument.id));
            }}
        } else {
            updatePointerFlags((draft) => {draft.adjustingCamera = true});
        }
    }

    function onPointerUp(e) {
        e.preventDefault();
        if (!pointers.length || e.pointerType !== pointers[0].pointerType)
            return;
        let newPointers = pointers.filter(x => x.pointerId !== e.pointerId);
        updatePointers(newPointers);
        setFingers(null);
        if (!newPointers.length) {
            if (pointerFlags.needToSelect) {
                if (e.ctrlKey || e.shiftKey)
                    dispatch(toggleSelectDocument(pointerFlags.needToSelect));
                else
                    dispatch(selectDocument(pointerFlags.needToSelect));
            } else if (pointerFlags.adjustingCamera && !pointerFlags.moveStarted)
                dispatch(selectDocument(''));
        }
        e.target.releasePointerCapture(e.pointerId);
    }

    function onPointerCancel(e) {
        e.preventDefault();
        updatePointers(pointers.filter(x => x.pointerId !== e.pointerId));
        setFingers(null);
        e.target.releasePointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
        e.preventDefault();
        let pointerIndex = pointers.findIndex(x => x.pointerId === e.pointerId);
        if (pointerIndex == -1)
            return;
        let dx = e.pageX - pointers[pointerIndex].pageX;
        let dy = pointers[pointerIndex].pageY - e.pageY;
        if (Math.abs(dx) >= 10 || Math.abs(dy) >= 10)
            updatePointerFlags((draft) => {draft.moveStarted = true;});
        if (!pointerFlags.moveStarted)
            return;
        if (pointerFlags.movingObjects) {
            updatePointerFlags((draft) => {draft.needToSelect = null});
            let p1 = xyInterceptFromPoint(e.pageX, e.pageY);
            let p2 = xyInterceptFromPoint(pointers[pointerIndex].pageX, pointers[pointerIndex].pageY);
            if (p1 && p2)
                dispatch(transform2dSelectedDocuments([1, 0, 0, 1, p1[0] - p2[0], p1[1] - p2[1]]));
            updatePointers((draft) => {
                draft[pointerIndex].pageX = e.pageX
                draft[pointerIndex].pageY = e.pageY
            })
        } else if (pointerFlags.adjustingCamera) {
            updatePointers((draft) => {
                draft[pointerIndex].pageX = e.pageX
                draft[pointerIndex].pageY = e.pageY
            })
            if (e.pointerType === 'touch' && this.pointers.length >= 2) {
                let centerX = this.pointers.reduce((acc, o) => acc + o.pageX, 0) / this.pointers.length;
                let centerY = this.pointers.reduce((acc, o) => acc + o.pageY, 0) / this.pointers.length;
                let distance = dist(
                    pointers[0].pageX, pointers[0].pageY,
                    pointers[1].pageX, pointers[1].pageY);
                if (fingers && fingers.num == pointers.length) {
                    if (pointers.length === 2) {
                        let d = distance - fingers.distance;
                        let origCenterX = pointers.reduce((acc, o) => acc + o.origPageX, 0) / this.pointers.length;
                        let origCenterY = pointers.reduce((acc, o) => acc + o.origPageY, 0) / this.pointers.length;
                        zoom(origCenterX, origCenterY, Math.exp(-d / 200));
                    } else if (pointers.length === 3) {
                        let dx = centerX - fingers.centerX;
                        let dy = centerY - fingers.centerY;
                        let rot = mat4.mul([],
                            mat4.fromRotation([], -dy / 100, vec3.cross([], camera.up, vec3.sub([], camera.eye, camera.center))),
                            mat4.fromRotation([], -dx / 100, camera.up));
                        updateCamera((draft) => {
                            draft.eye = vec3.add([], vec3.transformMat4([], vec3.sub([], camera.eye, camera.center), rot), camera.center);
                            draft.up = vec3.normalize([], vec3.transformMat4([], camera.up, rot));
                        });
                    }
                }
                setFingers({ num: pointers.length, centerX, centerY, distance });
            } else {
                setFingers(null);
                if (pointers[pointerIndex].button === 2) {
                    let rot = mat4.mul([],
                        mat4.fromRotation([], dy / 200, vec3.cross([], camera.up, vec3.sub([], camera.eye, camera.center))),
                        mat4.fromRotation([], -dx / 200, camera.up));
                    updateCamera((draft) => {
                        draft.eye = vec3.add([], vec3.transformMat4([], vec3.sub([], camera.eye, camera.center), rot), camera.center);
                        draft.up = vec3.normalize([], vec3.transformMat4([], camera.up, rot));
                    });
                } else if (pointers[pointerIndex].button === 1) {
                    zoom(pointers[pointerIndex].origPageX, pointers[pointerIndex].origPageY, Math.exp(-dy / 200));
                } else if (pointers[pointerIndex].button === 0) {
                    let view = calcCamera({
                        viewportWidth: dimensions.width,
                        viewportHeight: dimensions.height,
                        fovy: camera.fovy,
                        near: .1,
                        far: 2000,
                        eye: [0, 0, vec3.distance(camera.eye, camera.center)],
                        center: [0, 0, 0],
                        up: [0, 1, 0],
                        showPerspective: false,
                        machineX: settings.machineBottomLeftX - com.workOffsetX,
                        machineY: settings.machineBottomLeftY - com.workOffsetY,
                    }).view;
                    let scale = 2 / dimensions.width / view[0];
                    dx *= scale;
                    dy *= scale;
                    let n = vec3.normalize([], vec3.cross([], camera.up, vec3.sub([], camera.eye, camera.center)));
                    updateCamera((draft) => {
                        draft.eye = vec3.add([], camera.eye,
                            vec3.add([], vec3.scale([], n, -dx), vec3.scale([], camera.up, -dy)));
                        draft.center = vec3.add([], camera.center,
                            vec3.add([], vec3.scale([], n, -dx), vec3.scale([], camera.up, -dy)));
                    });
                }
            }
        }
    }

    function handleMouseOver(e) {
        setHotkeysEnabled(true);
    }

    function handleMouseOut(e) {
        setHotkeysEnabled(false);
    }

    function wheel(e) {
        zoom(e.pageX, e.pageY, Math.exp(e.deltaY / 2000));
    }

    function contextMenu(e) {
        e.preventDefault();
    }

        return(
            <div style={{ touchAction: 'none', userSelect: 'none' }} >
                <div style={{ touchAction: 'none' }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onWheel={wheel}
                    onContextMenu={contextMenu}
                    onMouseOver={handleMouseOver}
                    onMouseOut={handleMouseOut}>
                    <div className="workspace-content">
                        <canvas
                            style={{ width: width, height: height }}
                            width={Math.round(width * window.devicePixelRatio)}
                            height={Math.round(height * window.devicePixelRatio)}
                            ref={canvasRef} />
                    </div>
                    <Dom3d className="workspace-content workspace-overlay" camera={viewCamera} width={dimensions.width} height={dimensions.height} settings={settings}>
                        <GridText {...{ width: settings.toolGridWidth,
                                        height: settings.toolGridHeight,
                                        minor: Math.max(settings.toolGridMinorSpacing,0.1),
                                        major: Math.max(settings.toolGridMajorSpacing,1),
                                        xcolor: settings.toolGridXColor,
                                        ycolor: settings.toolGridYColor
                        }} />
                    </Dom3d>
                </div>

                <SetSize className="workspace-content workspace-overlay" selector=".floating-controls">
                    <FloatingControls
                        documents={documents} documentCacheHolder={documentsCache} camera={viewCamera}
                        workspaceWidth={width} workspaceHeight={height} dispatch={dispatch}
                        settings={settings}
                    />
                </SetSize>

                <div className={"workspace-content workspace-overlay " + mode}></div>
            </div>
        );
}
export default function Workspace({style}){

    const gcode = useSelector((state) => state.gcode.content);
    const settings = useSelector((state) => state.settings);
    const com = useSelector((state) => state.com);

    const {documentsCache} = useContext(DocumentCacheContext);

    const [camera, updateCamera] = useImmer(resetCamera());
    const [workspace, updateWorkspace] = useImmer({
        width: 1000,
        height: 1000,
        g0Rate: 1000,
        rotaryDiameter: 50,
        simTime: 1e10,
        showControls: true,
        showGcode: true,
        showLaser: true,
        showDocuments: true,
        showRotary: false,
        showCursor: true,
        showWebcam: false,
        showRasterPreview: false,
        initialZoom: false,
        gcode: "",
    });

    const [parsedGcode, setParsedGcode] = useState({arrayVersion: 0});
    const [parsedLaser, setParsedLaser] = useState({arrayVersion: 0});
    const [simDetails, setSimDetails] = useState("No Gcode loaded")

    let enableVideo = ((settings.toolVideoDevice !== null) || (!!settings.toolWebcamUrl));

    useEffect(() => {
        updateWorkspace((draft) => {draft.gcode = gcode});
        updateWorkspace((draft) => {draft.simTime = 1e10 });
        let parsedGC= parseGcode(gcode);
        setParsedGcode(parseGcodePreview(parsedGC, parsedGcode.arrayVersion));
        setParsedLaser(parseLaserPreview(parsedGC, parsedLaser.arrayVersion));
    }, [gcode]);

    useEffect(() => {
        setSimDetails(updateSimDetails());
    }, [parsedGcode, parsedLaser]);

    function setSimTime(e) {
            if (e.target.value >= parsedGcode.g1Time + parsedGcode.g0Dist / settings.simG0Rate - .00001)
                updateWorkspace((draft) => {draft.simTime = 1e10 });
            else
                updateWorkspace((draft) => {draft.simTime = +e.target.value });
        };

    function resetCamera() {
        return {
            eye: [settings.machineWidth / 2, settings.machineHeight / 2, Math.max(settings.machineWidth, settings.machineHeight)],
            center: [settings.machineWidth / 2, settings.machineHeight / 2, 0],
            up: [0, 1, 0],
            fovy: Math.PI / 2.6,
            showPerspective: false,
        };
    }

    function zoomArea( x1, y1, x2, y2 ) {
        let d = 300;
        let cx = (x1 + x2) / 2 - settings.machineBottomLeftX + com.workOffsetX;
        let cy = (y1 + y2) / 2 - settings.machineBottomLeftY + com.workOffsetY;
        let fovy = 2 * Math.atan2(Math.max(Math.abs(y2 - y1), Math.abs(x2 - x1) * workspace.height / workspace.width) / 2, d);
        updateCamera({
            eye: [cx, cy, d],
            center: [cx, cy, 0],
            up: [0, 1, 0],
            fovy,
            showPerspective: false,
        });
    }

    function zoomMachine() {
        let x = settings.machineBottomLeftX;
        let y = settings.machineBottomLeftY;
        if (!settings.showMachine) {
            x = 0;
            y = 0;
        }
        zoomArea(
            x - 10 - com.workOffsetX,
            y - 10 - com.workOffsetY,
            x + settings.machineWidth + 10 - com.workOffsetX,
            y + settings.machineHeight + 10 - com.workOffsetY
        );
    }

    function zoomDoc() {
        let found = false;
        let bounds = { x1: Number.MAX_VALUE, y1: Number.MAX_VALUE, x2: Number.MIN_VALUE, y2: Number.MIN_VALUE };
        for (let cache of documentsCache.values()) {
            let doc = cache.document;
            if (doc.selected && doc.transform2d && cache.bounds) {
                found = true;
                bounds.x1 = Math.min(bounds.x1, cache.bounds.x1 + doc.transform2d[4]);
                bounds.y1 = Math.min(bounds.y1, cache.bounds.y1 + doc.transform2d[5]);
                bounds.x2 = Math.max(bounds.x2, cache.bounds.x2 + doc.transform2d[4]);
                bounds.y2 = Math.max(bounds.y2, cache.bounds.y2 + doc.transform2d[5]);
            }
        }

        if (!found) {
            for (let cache of documentsCache.values()) {
                let doc = cache.document;
                if (doc.transform2d && cache.bounds) {
                    found = true;
                    bounds.x1 = Math.min(bounds.x1, cache.bounds.x1 + doc.transform2d[4]);
                    bounds.y1 = Math.min(bounds.y1, cache.bounds.y1 + doc.transform2d[5]);
                    bounds.x2 = Math.max(bounds.x2, cache.bounds.x2 + doc.transform2d[4]);
                    bounds.y2 = Math.max(bounds.y2, cache.bounds.y2 + doc.transform2d[5]);
                }
            }
        }

        if (found) {
            let marginX = (bounds.x2 - bounds.x1) / 50;
            let marginY = (bounds.y2 - bounds.y1) / 50;
            zoomArea(bounds.x1 - marginX, bounds.y1 - marginY, bounds.x2 + marginX, bounds.y2 + marginY);
        }
    }

    function zoomGcode() {
        if (parsedGcode.array) {
            let marginX = (parsedGcode.maxX - parsedGcode.minX) / 50;
            let marginY = (parsedGcode.maxY - parsedGcode.minY) / 50;
            zoomArea(parsedGcode.minX - marginX, parsedGcode.minY - marginY, parsedGcode.maxX + marginX, parsedGcode.maxY + marginY);
        }
    }

    function updateSimDetails() {
        let totalSecs = Math.floor((parsedGcode.g1Time + parsedGcode.g0Dist / settings.simG0Rate) * 60);
        let simSummary = 'No Gcode loaded'
        let codeSize = gcode.length;
        if (totalSecs > 0) {
            let activeSecs = Math.floor(parsedGcode.g1Time * 60);
            let secs = totalSecs % 60;
            let mins = Math.floor(totalSecs / 60) % 60;
            let hrs = Math.floor(totalSecs / 3600);
            let duty = Math.floor(activeSecs / totalSecs * 100);
            let xsize = parsedGcode.maxX - parsedGcode.minX;
            let ysize = parsedGcode.maxY - parsedGcode.minY;
            if (hrs > 0) simSummary = 'Estimated run time: ' + hrs + 'h, ' + mins + 'm. Tool duty cycle: ' + duty + '%. ';
            else simSummary = 'Estimated run time: ' + mins + 'm, '+ secs + 's. Tool duty cycle: ' + duty + '%. ';
            simSummary += 'Size: ' + xsize.toFixed(2) + ' x ' + ysize.toFixed(2) + ' mm. ';
            simSummary += "Code: " + humanFileSize(codeSize) + ", Moves: " + parsedGcode.moves;
        } else if (codeSize > 0) {
            simSummary = "Analysis failed. No tool operations. Check code before using. " + humanFileSize(codeSize)
        }
        // CommandHistory.write(simSummary, CommandHistory.INFO);
        return simSummary.replace(/\. /g, '\n');
    }

    return (
            <div id="workspace" className="full-height" style={style}>
                <SetSize id="workspace-top">
                    <WorkspaceContent camera={camera} updateCamera={updateCamera} zoomArea={zoomArea} workspace={workspace} updateWorkspace={updateWorkspace} parsedGcode={parsedGcode} parsedLaser={parsedLaser} />
                </SetSize>
                <div id="workspace-controls" style={ workspace.showControls ? { height: 'fit-content' } : { height: '42px' }}>
                    <div style={{ display: 'flex' }}>
                        <table style={{ flex: 'none' }}>
                            <tbody>
                                <tr style={{ height: '42px'}} >
                                    <td colSpan='2'>
                                        <button className='btn btn-default' style={{ paddingLeft: '0.1em', paddingRight: '0.1em' }} title='Show/Hide the workspace options, analyser and console' onClick={() => updateWorkspace((draft) => {draft.showControls = !workspace.showControls})}><i className="fa fa-fw fa-bars"></i></button>
                                        <button className='btn btn-default' style={{ marginLeft: '4px' }} title='Scale view to Machine Bed' onClick={zoomMachine}><i className="fa fa-fw fa-search"></i>Mach</button>
                                        <button className='btn btn-default' style={{ marginLeft: '4px' }} title='Scale view to Loaded Documents' onClick={zoomDoc}><i className="fa fa-fw fa-search"></i>Doc</button>
                                    </td>
                                </tr>
                                <tr>
                                    <td>Perspective</td>
                                    <td><input checked={camera.showPerspective} onChange={(e) => {updateCamera((draft) => {draft.showPerspective = e.target.checked })}} type="checkbox" /></td>
                                </tr>
                                <tr>
                                    <td>Show Gcode</td>
                                    <td><input checked={workspace.showGcode} onChange={(e) => {updateWorkspace((draft) => {draft.showGcode = e.target.checked })}} type="checkbox" /></td>
                                </tr>
                                <tr>
                                    <td>Show Tool</td>
                                    <td><input checked={workspace.showLaser} onChange={(e) => {updateWorkspace((draft) => {draft.showLaser = e.target.checked })}} type="checkbox" /></td>
                                </tr>
                                <tr>
                                    <td>Show Documents</td>
                                    <td><input checked={workspace.showDocuments} onChange={(e) => {updateWorkspace((draft) => {draft.showDocuments = e.target.checked })}} type="checkbox" /></td>
                                </tr>
                                {settings.machineAEnabled &&
                                    <tr>
                                        <td>Show Rotary</td>
                                        <td><input checked={workspace.showRotary} onChange={(e) => {updateWorkspace((draft) => {draft.showRotary = e.target.checked })}} type="checkbox" /></td>
                                    </tr>
                                }
                                {enableVideo &&
                                    <tr>
                                        <td>Show Webcam</td>
                                        <td><input checked={workspace.showWebcam} onChange={(e) => {updateWorkspace((draft) => {draft.showWebcam = e.target.checked })}} type="checkbox" /></td>
                                    </tr>
                                }
                                <tr>
                                    <td>Show Raster Preview</td>
                                    <td><input checked={workspace.showRasterPreview} onChange={(e) => {updateWorkspace((draft) => {draft.showRasterPreview = e.target.checked })}} type="checkbox" /></td>
                                </tr>
                            </tbody>
                        </table>
                        <table style={{ marginLeft: '4px', height: "fit-content"}}>
                            <tbody>
                                {(gcode.length > 0) &&
                                    <tr style={{ height: '42px'}} >
                                        <td>
                                            <button className='btn btn-default' title='Scale view to current Gcode' onClick={zoomGcode}><i className="fa fa-fw fa-search"></i>Gcode</button>
                                        </td>
                                    </tr>
                                }
                                {(gcode.length > 0) &&
                                    <tr>
                                        <td colSpan="2">
                                            <div className='simbar'>
                                                <input
                                                style={{ width: settings.simBarWidth + 'em' }}
                                                className='form-control'
                                                value={workspace.simTime}
                                                onChange={setSimTime}
                                                type="range"
                                                step="any"
                                                max={parsedGcode.g1Time + parsedGcode.g0Dist / settings.simG0Rate}
                                                glyphicon="transfer" />
                                            </div>
                                        </td>
                                    </tr>
                                }
                                <tr>
                                    <td colSpan="2">
                                        <pre  style={{ padding: '9px 10px 5px 10px', fontSize: '90%', backgroundColor: 'inherit' }} className='help-block' id='gcode-info-panel'>
                                            {simDetails}
                                        </pre>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <CommandHistory style={ workspace.showControls ? { flexGrow: 1, marginLeft: 10, display:'block' } : { flexGrow: 1, marginLeft: 10, display:'none' }}  onCommandExec={runCommand} />
                    </div>
                </div>

                <VideoPort width={320} enabled={enableVideo && workspace.showWebcam} draggable="parent" useCanvas={settings.toolVideoOMR} canvasProcess={settings.toolVideoOMR ? arucoProcess: null} />
                <ImagePort width={320} height={240} enabled={workspace.showRasterPreview} draggable="parent" />
            </div>
        )
}
