import _ from 'lodash';
import {ChannelsTypes, LogoutTypes} from 'constants';
const types = {...ChannelsTypes, ...LogoutTypes};

export const initState = {
    status: 'not fetched',
    error: null,
    data: {},
    currentChannelId: null
};

// TODO: this can be extracted into a util
function zipById(channels) {
    return _.zipObject(_.map(channels, 'id'), channels);
}

export default function reduceChannels(state = initState, action) {
    switch (action.type) {

    case types.SELECT_CHANNEL:
        return {...state,
            currentChannelId: action.channelId
        };

    case types.FETCH_CHANNELS_REQUEST:
        return {...state,
            status: 'fetching',
            error: null
        };
    case types.FETCH_CHANNELS_SUCCESS:
        return {...state,
            status: 'fetched',
            data: zipById(action.data.channels)
        };
    case types.FETCH_CHANNELS_FAILURE:
        return {...state,
            status: 'failed',
            error: action.error
        };

    case types.LOGOUT_SUCCESS:
        return initState;
    default:
        return state;
    }
}
