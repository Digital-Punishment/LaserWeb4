import { createSlice } from '@reduxjs/toolkit';

const initialState = {};

const splittersSlice = createSlice({
    name: 'splitters',
    initialState,
    reducers: {
        splitterResized(state, action){
            const { id, size } = action.payload;
            state[id] = size;
        }
    }
})

export default splittersSlice.reducer;
export const { splitterResized } = splittersSlice.actions;
