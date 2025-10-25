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

import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux'

import {splitterResized} from "../reducers/splittersSlice";

export default function Splitter({ style, split, splitterId, initialSize, minSize, resizerStyle, className, children }) {

    const dispatch = useDispatch();
    const splitters = useSelector((state) => state.splitters);

    const [mouse, setMouse] = useState({x: 0, y: 0});
    const [touching, setTouching] = useState(false);

    const currentSize = useRef(splitters[splitterId]);
    const currentMouse = useRef(mouse);
    const currentTouch = useRef(touching);

    useEffect(() => {
        if (splitters[splitterId] === undefined)
            dispatch(splitterResized({id: splitterId, size: initialSize}));
        if (minSize && splitters[splitterId] < minSize)
            dispatch(splitterResized({id: splitterId, size: minSize}));
    }, [initialSize, minSize, splitters]);

    useEffect(() => {
        currentMouse.current = mouse;
    }, [mouse]);

    useEffect(() => {
        currentSize.current = splitters[splitterId];
    }, [splitters]);

    useEffect(() => {
        currentTouch.current = touching;
    }, [touching]);

    function mouseDown(e) {
        e.preventDefault();
        document.addEventListener('mouseup', mouseUp);
        document.addEventListener('mouseleave', mouseUp);
        document.addEventListener('mousemove', mouseMove);
        setMouse({x: e.clientX, y: e.clientY});
    }

    function touchStart(e) {
        e.preventDefault();
        document.addEventListener('touchend', touchEnd);
        document.addEventListener('touchcancel', touchEnd);
        document.addEventListener('touchmove', touchMove);
        setTouching(true);
        let touch = e.changedTouches[0];
        setMouse({x: touch.clientX, y: touch.clientY});
    }

    function move(clientX, clientY) {
        let delta = split === 'horizontal' ? clientY - currentMouse.current.y : clientX - currentMouse.current.x;
        setMouse({x: clientX, y: clientY});
        let newSize = currentSize.current + delta;
        if (newSize !== currentSize.current)
            if ((!minSize && newSize >= 0) || (minSize && newSize >= minSize))
                dispatch(splitterResized({id: splitterId, size: newSize}));
    }

    function mouseMove(e) {
        e.preventDefault();
        move(e.clientX, e.clientY);
    }

    function touchMove(e) {
        e.preventDefault();
        let touch = e.changedTouches[0];
        if (currentTouch.current)
            move(touch.clientX, touch.clientY);
    }

    function mouseUp(e) {
        e.preventDefault();
        document.removeEventListener('mouseup', mouseUp);
        document.removeEventListener('mouseleave', mouseUp);
        document.removeEventListener('mousemove', mouseMove);
    }

    function touchEnd(e) {
        e.preventDefault();
        setTouching(false);
        document.removeEventListener('touchend', touchEnd);
        document.removeEventListener('touchcancel', touchEnd);
        document.removeEventListener('touchmove', touchMove);
    }

        return (
            <div style={{ ...style, display: 'flex', flexDirection: split === 'horizontal' ? 'column' : 'row' }} className={className}>
                <div style={ split === 'horizontal' ? {height: splitters[splitterId]} : {width: splitters[splitterId]} }>
                    {children}
                </div>
                <div className={'Resizer ' + split} style={resizerStyle} onMouseDown={mouseDown} onTouchStart={touchStart} />
            </div >
        );
}
