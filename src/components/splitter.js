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

import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux'

import Capture from './capture';
import { splitterSetSize } from '../actions/splitters'

export default function Splitter({ style, split, splitterId, initialSize, minSize, resizerStyle, className, children }) {

    const dispatch = useDispatch();
    const splitters = useSelector((state) => state.splitters);

    const [mouse, setMouse] = useState({x: 0, y: 0});
    const [touching, setTouching] = useState(false);

    useEffect(() => {
        if (splitters[splitterId] === undefined)
            dispatch(splitterSetSize(splitterId, initialSize));
        if (minSize && splitters[splitterId] < minSize)
            dispatch(splitterSetSize(splitterId, minSize));
    }, [initialSize, minSize])

    function mouseDown(e) {
        setMouse({x: e.clientX, y: e.clientY});
    }

    function touchStart(e) {
        e.preventDefault();
        setTouching(true);
        let touch = e.changedTouches[0];
        setMouse({x: touch.clientX, y: touch.clientY});
    }

    function move(clientX, clientY) {
        let delta = split === 'horizontal' ? clientY - mouse.y : clientX - mouse.x;
        setMouse({x: clientX, y: clientY});
        let newSize = splitters[splitterId] + delta;
        if (!minSize || (minSize && newSize >= minSize))
            dispatch(splitterSetSize(splitterId, newSize));
    }

    function mouseMove(e) {
        move(e.clientX, e.clientY);
    }

    function touchMove(e) {
        e.preventDefault();
        let touch = e.changedTouches[0];
        if (touching)
            move(touch.clientX, touch.clientY);
    }

    function touchEnd(e) {
        setTouching(false);
    }

        return (
            <div style={{ ...style, display: 'flex', flexDirection: split === 'horizontal' ? 'column' : 'row' }} className={className}>
                <div style={ split === 'horizontal' ? {height: splitters[splitterId] } : {width: splitters[splitterId]} }>
                    {children}
                </div>
                <Capture onMouseDown={mouseDown} onTouchStart={touchStart} onMouseMove={mouseMove} onTouchMove={touchMove}
                    onTouchEnd={touchEnd} onTouchCancel={touchEnd}>
                    <div className={'Resizer ' + split} style={resizerStyle} />
                </Capture>
            </div >
        );
}
