import { createSlice, nanoid } from '@reduxjs/toolkit';

const initialState = require("../data/macros.json");

const macrosSlice = createSlice({
    name: 'macros',
    initialState,
    reducers: {
        macroChanged: {
            reducer(state, action) {
                state[action.payload.id] = action.payload.macro;
            },
            prepare(id, macro) {
                if (id === "")
                    id = nanoid();
                return {
                    payload: { id, macro }
                }
            },
        },
        macroRemoved(state, action) {
            if (action.payload.id !== "" && state[action.payload.id])
                delete state[action.payload.id];
        },
        macroReset(state, action) {
            return initialState;
        },
        macroLocked(state, action) {
            if (action.payload.id !== "" && state[action.payload.id])
                state[action.payload.id]._locked = !state[action.payload.id]._locked;
        },
    },
});

export default macrosSlice.reducer;
export const { macroChanged, macroRemoved, macroReset, macroLocked } = macrosSlice.actions;
