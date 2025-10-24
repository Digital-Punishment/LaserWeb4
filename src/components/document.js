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

import React, {useState, useRef} from 'react'
import { useSelector, useDispatch } from 'react-redux';

import Subtree from './subtree';
import { removeDocument, selectDocument, toggleSelectDocument, toggleVisibleDocument } from '../actions/document';
import { addOperation, operationAddDocuments } from '../actions/operation';

import Icon from './font-awesome';

function isSelected(documents, d) {
    if (!d.selected)
        return false;
    for (let p of documents)
        if (p.selected && p.children.includes(d.id))
            return false;
    return true;
}

export function selectedDocuments(documents) {
    return documents.filter(d => isSelected(documents, d)).map(d => d.id);
}

function DocumentLabel({object}) {

    const dispatch = useDispatch();
    const documents = useSelector((state) => state.documents);

    const [pointerType, setPointerType] = useState('');
    const [needToSelect, setNeedToSelect] = useState(false);
    const [isToggle, setIsToggle] = useState(false);
    const [dragStarted, setDragStarted] = useState(false);
    const [drag, setDrag] = useState({x: 0, y: 0});

    const docRef = useRef(null);


    function onPointerDown(e) {
        e.preventDefault();
        e.target.setPointerCapture(e.pointerId);
        let newPointerType = e.pointerType;
        let newNeedToSelect = false;
        let newIsToggle = false;
        if (newPointerType === 'pen' || newPointerType === 'touch') {
            newNeedToSelect = object.selected;
            newIsToggle = true;
            setDragStarted(false);
            if (!object.selected)
                dispatch(toggleSelectDocument(object.id));
        } else {
            newNeedToSelect = false;
            newIsToggle = e.ctrlKey || e.shiftKey;
            setDragStarted(false);
            if (object.selected)
                newNeedToSelect = true;
            else if (newIsToggle)
                dispatch(toggleSelectDocument(object.id));
            else
                dispatch(selectDocument(object.id));
        setPointerType(newPointerType);
        setNeedToSelect(newNeedToSelect);
        setIsToggle(newIsToggle);
        }
    }

    function onPointerMove(e) {
        if (e.pointerType !== pointerType)
            return;
        e.preventDefault();
        let elem = document.elementFromPoint(e.clientX, e.clientY);
        setDrag({x: e.clientX, y: e.clientY})
        if (elem != docRef.current && !dragStarted) {
            setDragStarted(true);
            if ((pointerType === 'pen' || pointerType === 'touch') && !needToSelect)
                dispatch(selectDocument(object.id));
        }
    }

    function drop(clientX, clientY) {
        let elem = document.elementFromPoint(clientX, clientY);
        while (elem && !elem.dataset.operationId)
            elem = elem.parentElement;
        if (elem) {
            let docs = documents.filter(d => isSelected(documents, d)).map(d => d.id);
            if (elem.dataset.operationId === 'new')
                dispatch(addOperation({ documents: docs }));
            else
                dispatch(operationAddDocuments(elem.dataset.operationId, elem.dataset.operationTabs, docs));
        }
    }

    function onPointerUp(e) {
        if (e.pointerType !== pointerType)
            return;
        e.preventDefault();
        if (dragStarted) {
            drop(e.clientX, e.clientY);
            setDragStarted(false);
        } else if (needToSelect) {
            if (isToggle)
                dispatch(toggleSelectDocument(object.id));
            else
                dispatch(selectDocument(object.id));
        }
        setPointerType('');
        e.target.releasePointerCapture(e.pointerId);
    }

    function onPointerCancel(e) {
        if (e.pointerType !== pointerType)
            return;
        e.preventDefault();
        setDragStarted(false);
        setPointerType('');
        e.target.releasePointerCapture(e.pointerId);
    }

        let style;
        if (object.selected)
            style = { userSelect: 'none', cursor: 'grab', textDecoration: 'bold', color: '#FFF', paddingLeft: 5, paddingRight: 5, paddingBottom: 3, backgroundColor: '#337AB7', border: '1px solid', borderColor: '#2e6da4', borderRadius: 2 };
        else
            style = { userSelect: 'none', cursor: 'copy', paddingLeft: 5, paddingRight: 5, paddingBottom: 3 };
        let dragDiv;
        if (dragStarted)
            dragDiv = (
                <div style={{ position: 'absolute', zIndex: 1000, left: drag.x, top: drag.y, pointerEvents: 'none' }}>
                    <div style={{ position: 'relative', transform: 'translate(-50%,-50%)' }}>
                        {documents.filter(d => isSelected(documents, d)).map(doc =>
                            <div key={doc.id} style={{ color: '#FFF', backgroundColor: '#337AB7' }}>{doc.name}</div>)}
                    </div>
                </div>
            );

        return (
            <span ref={docRef} style={style}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
                {object.name}
                {dragDiv}
            </span>
        );
};

function DocumentRight({object}) {

    const dispatch = useDispatch();

    return (
        <div className="btn-group">
            <button
                className="btn btn-default btn-xs"
                onClick={e => dispatch(toggleVisibleDocument(object.id))}>
                <Icon name={(object.visible === true || object.visible === undefined) ? "eye" : "eye-slash"} />
            </button>
            <button
                className="btn btn-danger btn-xs"
                onClick={e => dispatch(removeDocument(object.id))}>
                <i className="fa fa-times"></i>
            </button>
        </div>
    );
}

const getSelectedParents=(documents)=>{
    let objects = documents.filter(i=>i.selected);
    let tree=new Set();
    let getPath= (object) =>{
        let item = documents.find( item => item.children && item.children.includes(object.id));
            if (item) {
                tree.add(item.id);
                getPath(item);
            }

    }
    objects.forEach((i)=>getPath(i))
    return [...tree]
}

export function Documents({documents, toggleExpanded, filter}) {
    let rowNumber = { value: 0 };
    return (
        <div style={{ touchAction: 'none' }}>
            {documents
                .filter(document => !!filter || document.isRoot)
                .filter(document => {
                    return (document.name.indexOf(filter)>=0) || !filter
                })
                .map(document => (
                    <Subtree
                        key={document.id} objects={documents} object={document}
                        Label={DocumentLabel} Right={DocumentRight} rowNumber={rowNumber}
                        toggleExpanded={object => toggleExpanded(object)}
                        selectedDocuments={getSelectedParents(documents)} />
                ))}
        </div>

    );
}
