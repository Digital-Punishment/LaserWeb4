import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    selected: "cam",
    visible: true,
};

const panesSlice = createSlice({
    name: 'panes',
    initialState,
    reducers: {
        paneSelected(state, action) {
            if (state.selected === action.payload.id)
                state.visible = !state.visible;
            else {
                state.selected = action.payload.id;
                state.visible = true;
            }
        }
    }
});

export default panesSlice.reducer;
export const { paneSelected } = panesSlice.actions;
