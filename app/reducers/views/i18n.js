// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {combineReducers} from 'redux';

import Config from 'assets/config.json';

import {UserTypes} from 'mattermost-redux/action_types';

function locale(state = Config.DefaultLocale, action) {
    switch (action.type) {
    case UserTypes.RECEIVED_ME: {
        const data = action.data || action.payload;
        return data.locale;
    }
    case UserTypes.LOGOUT_SUCCESS:
        return Config.DefaultLocale;
    }

    return state;
}

export default combineReducers({
    locale
});
