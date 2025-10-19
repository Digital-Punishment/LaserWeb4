/**
 * LaserWeb main module (layout).
 * - Create the main layout.
 * - Set initial state.
 * @module
 */

// Styles/Fonts
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'font-awesome/css/font-awesome.min.css'
import '../styles/index.css'
import '../styles/resizer.css';
import 'bootstrap-range-input/dist/css/bootstrap-range-input.min.css'

import ReactDOM from 'react-dom'

// React/Redux
import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'

// Main components
import Sidebar from './sidebar'
import Workspace from './workspace'

// Inner components
import Com from './com'
import Jog from './jog'
import Cam from './cam'
import Quote from './quote'
import Settings from './settings'
import About from './about'

import { AllowCapture } from './capture'
import { DocumentCacheHolder } from './document-cache'

import { keyboardUndoAction } from '../actions/laserweb';

import { useHotkeys } from 'react-hotkeys-hook';

import { VideoCapture } from '../lib/video-capture'
import { fetchRelease } from '../lib/releases'

import { DrawCommands } from '../draw-commands'

var vex = require('vex-js')
vex.registerPlugin(require('vex-dialog'))
vex.defaultOptions.className = 'vex-theme-os'
import 'vex-js/dist/css/vex.css';
import 'vex-js/dist/css/vex-theme-os.css';

import { version } from '../reducers/settings'

import { setSettingsAttrs } from '../actions/settings'

/**
 * LaserWeb main component (layout).
 * - Create the main layout.
 *
 * @extends module:react~React~Component
 * @param {Object} props Component properties.
 */

export const confirm = (message, callback, skip=false) => {
    if (skip) return callback(true);
    vex.dialog.confirm({ message, callback })
}

export const prompt = (message, placeholder, callback, skip) => {
    if (skip) return callback(placeholder);
    vex.dialog.open({
        message,
        input: `<input name="prompt" type="text" placeholder="${placeholder}" value="${placeholder}"  />`,
        buttons: [
            $.extend({}, vex.dialog.buttons.YES, { text: 'Ok' }),
            $.extend({}, vex.dialog.buttons.NO, { text: 'Cancel' })
        ],
        callback: function (data) {
            if (data===false) {
                callback(null)
            } else {
                callback(data.prompt || "")
            }
        }
    })
}

export const alert = (unsafeMessage) => {
    vex.dialog.alert({ unsafeMessage })
}

const updateTitle=()=>{
    document.title = `Laserweb ${version}`;
}

export default function LaserWeb() {

    const dispatch = useDispatch();
    const macros = useSelector((state) => state.settings.macros);
    const documents = useSelector((state) => state.documents);
    const settings = useSelector((state) => state.settings);

    const [glOk, setGlOk] = useState(false);

    const handleVideoStream = (deviceId, props) => {
        if (props === false) dispatch({ type: "SETTINGS_SET_ATTRS", payload: { attrs: { toolVideoDevice: null } } })
    }

    useEffect(() => {
        updateTitle();

        try {
            let canvas = document.createElement('canvas');
            let gl = canvas.getContext('webgl', { alpha: true, depth: true, antialias: true, preserveDrawingBuffer: true });
            if (!gl)
                throw "canvas.getContext('webgl', {...}) returned " + gl;
            let drawCommands = new DrawCommands(gl);
            drawCommands.destroy();
            setGlOk(true);
        } catch (e) {
            console.error(e);
            return;
        }
    }, []);

    useEffect(() => {
        updateTitle();
        if (glOk) {
            // setupKeybindings();
            setupVideoCapture();
        }
        fetchRelease().then(function(data){
            if (settings.__latestRelease) {
                if (Math.abs(new Date(data.created_at).getTime() - new Date(settings.__latestRelease).getTime()))
                {
                    alert(`New release (<a href="${data.html_url}" target="__blank">${data.tag_name}</a>) available`);
                }
            }
            if (settings.__latestRelease !== data.created_at)
                dispatch(setSettingsAttrs({__latestRelease: data.created_at}))
        })
        }, [glOk]);

    const hotkeysOptions = {enabled: glOk, preventDefault: true};
    useHotkeys(['command + z', 'control+z'], () => dispatch(keyboardUndoAction()), hotkeysOptions);

    function setupVideoCapture()
    {
        if (!window.videoCapture) {
            const onNextFrame = (callback) => { setTimeout(() => { window.requestAnimationFrame(callback) }, 0) }
            onNextFrame(() => {
                window.videoCapture = new VideoCapture()
                window.videoCapture.scan(settings.toolVideoDevice, settings.toolVideoResolution, (obj) => { handleVideoStream(settings.toolVideoDevice, obj) })
            })
        }
    }

        // 2017-01-21 Pvdw - removed the following from Dock
        // <Gcode id="gcode" title="G-Code" icon="file-code-o" />
        // <Quote id="quote" title="Quote" icon="money" />

        if (!glOk) {
            return (
                <h1>OpenGL won't start. This app can't run without it.</h1>
            );
        }

        return (
            <AllowCapture style={{ height: '100%' }}>
                <DocumentCacheHolder style={{ width: '100%' }} documents={documents}>
                    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', width: '100%' }}>
                        <Sidebar style={{ flexGrow: 0, flexShrink: 0 }}>
                            <Cam id="cam" title="Files" icon="pencil-square-o" />
                            <Com id="com" title="Comms" icon="plug" />
                            <Jog id="jog" title="Control" icon="arrows-alt" />
                            <Settings id="settings" title="Settings" icon="cogs" />
                            <About id="about" title="About" icon="question" />
                        </Sidebar>
                        <Workspace style={{ flexGrow: 1, position: "relative" }} />
                    </div>
                </DocumentCacheHolder>
            </AllowCapture>
        )
}
