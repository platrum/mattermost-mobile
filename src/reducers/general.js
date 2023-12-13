// Copyright (c) 2016 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {combineReducers} from 'redux';
import {initialState, handle} from './helpers.js';
import {GeneralTypes as types} from 'constants';

export const initState = initialState();

// TODO: clientConfig should be cleared when the user logs out.
// We can't do so until it's extracted into its own store with more reducers
export function clientConfig(state = initState, action) {
    return handle(
      types.CLIENT_CONFIG_REQUEST,
      types.CLIENT_CONFIG_SUCCESS,
      types.CLIENT_CONFIG_FAILURE,
      state,
      action);
}

export function ping(state = initialState(), action) {
    return handle(
      types.PING_REQUEST,
      types.PING_SUCCESS,
      types.PING_FAILURE,
      state,
      action);
}

export default combineReducers({
    clientConfig,
    ping
});
