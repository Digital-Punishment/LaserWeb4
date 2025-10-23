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

// Includes code from CSS3DRenderer.js:
//      Author mrdoob / http://mrdoob.com/
//      Based on http://www.emagix.net/academic/mscs-project/item/camera-sync-with-css3-and-webgl-threejs

import { mat4 } from 'gl-matrix';
import React, { useState, useEffect } from 'react'

function epsilon(value) {
    return Math.abs(value) < Number.EPSILON ? 0 : value;
};

function getCameraCSSMatrix(matrix) {
    return 'matrix3d(' +
        epsilon(matrix[0]) + ',' +
        epsilon(- matrix[1]) + ',' +
        epsilon(matrix[2]) + ',' +
        epsilon(matrix[3]) + ',' +

        epsilon(matrix[4]) + ',' +
        epsilon(-matrix[5]) + ',' +
        epsilon(matrix[6]) + ',' +
        epsilon(matrix[7]) + ',' +

        epsilon(matrix[8]) + ',' +
        epsilon(-matrix[9]) + ',' +
        epsilon(matrix[10]) + ',' +
        epsilon(matrix[11]) + ',' +

        epsilon(matrix[12]) + ',' +
        epsilon(- matrix[13]) + ',' +
        epsilon(matrix[14]) + ',' +
        epsilon(matrix[15]) +
        ')';
};

export function Dom3d({className, camera, width, height, children}) {

    const [fov, setFOV] = useState();
    const [transform, setTransform] = useState();

    useEffect(() => {
        if (!camera)
            return;
        let newFOV;
        let newTransform;
        if (camera.fovy) {
            newFOV = 0.5 * height / Math.tan(camera.fovy * 0.5);
            newTransform = "translate3d(0,0," + newFOV + "px)" + getCameraCSSMatrix(camera.view) +
                " translate3d(" + width / 2 + "px," + height / 2 + "px, 0)";
        } else {
            newTransform = "scale(" + width / 2 + "," + height / 2 + ") " + getCameraCSSMatrix(camera.view) +
                " translate3d(" + width / 2 + "px," + height / 2 + "px, 0)";
            newFOV = 'none';
        }
        setFOV(newFOV);
        setTransform(newTransform);
    }, [camera, width, height]);

        return (
            <div className={className} style={{
                overflow: 'hidden',
                transformStyle: 'preserve-3d',
                perspective: fov
            }}>
                <div style={{
                    position: 'absolute',
                    width: width,
                    height: height,
                    transformStyle: 'preserve-3d',
                    transform: transform,
                }}>
                    {children}
                </div>
            </div >
        );
}

export function Text3d({x, y, size, style, label, children}) {

        return (
            <div style={{
                position: 'absolute',
                transform: 'translate3d(' + x + 'px,' + y + 'px,0) translate3d(-50%,-50%,0) scale(.1,-.1)',
            }}>
                <div style={Object.assign({}, style, {
                    left: 0,
                    top: 0,
                    fontSize: size * 10,
                })}>
                    {label || children}
                </div>
            </div >
        );

}
