// Copyright (c) 2017-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {bindActionCreators} from 'redux';
import {connect} from 'react-redux';

import {searchChannels} from 'mattermost-redux/actions/channels';
import {General} from 'mattermost-redux/constants';
import {getMyChannels, getOtherChannels} from 'mattermost-redux/selectors/entities/channels';

import {getTheme} from 'app/selectors/preferences';

import ChannelMention from './channel_mention';

function mapStateToProps(state, ownProps) {
    const {currentChannelId} = state.entities.channels;

    let postDraft;
    if (ownProps.rootId.length) {
        postDraft = state.views.thread.drafts[ownProps.rootId].draft;
    } else {
        postDraft = state.views.channel.drafts[currentChannelId].draft;
    }

    const autocompleteChannels = {
        myChannels: getMyChannels(state).filter((c) => c.type !== General.DM_CHANNEL && c.type !== General.GM_CHANNEL),
        otherChannels: getOtherChannels(state)
    };

    return {
        ...ownProps,
        currentChannelId,
        currentTeamId: state.entities.teams.currentTeamId,
        postDraft,
        autocompleteChannels,
        requestStatus: state.requests.channels.getChannels.status,
        theme: getTheme(state)
    };
}

function mapDispatchToProps(dispatch) {
    return {
        actions: bindActionCreators({
            searchChannels
        }, dispatch)
    };
}

export default connect(mapStateToProps, mapDispatchToProps)(ChannelMention);
