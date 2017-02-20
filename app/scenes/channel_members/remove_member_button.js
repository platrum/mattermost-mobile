// Copyright (c) 2017 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import React, {PropTypes} from 'react';
import {connect} from 'react-redux';
import {
    TouchableOpacity,
    View
} from 'react-native';

import FormattedText from 'app/components/formatted_text';

import {getCurrentUserRoles} from 'service/selectors/entities/users';
import {getCurrentChannel} from 'service/selectors/entities/channels';
import {getTheme} from 'service/selectors/entities/preferences';
import {Constants} from 'service/constants';

function RemoveMemberButton(props) {
    const {currentChannel, isAdmin} = props;
    if (!isAdmin || currentChannel.type === Constants.DM_CHANNEL || currentChannel.name === Constants.DEFAULT_CHANNEL) {
        return null;
    }

    return (
        <View style={{flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flex: 1}}>
            <TouchableOpacity
                onPress={() => props.emitter('remove_members')}
                style={{paddingHorizontal: 15}}
            >
                <FormattedText
                    id='channel_members_modal.remove'
                    defaultMessage='Remove'
                    style={{color: props.theme.sidebarHeaderTextColor}}
                />
            </TouchableOpacity>
        </View>
    );
}

RemoveMemberButton.propTypes = {
    emitter: PropTypes.func.isRequired,
    isAdmin: PropTypes.bool.isRequired,
    currentChannel: PropTypes.object.isRequired,
    theme: PropTypes.object
};

RemoveMemberButton.defaultProps = {
    theme: {}
};

function mapStateToProps(state) {
    const currentUserRoles = getCurrentUserRoles(state);

    const isAdmin = currentUserRoles.includes('_admin');
    return {
        isAdmin,
        currentChannel: getCurrentChannel(state),
        theme: getTheme(state)
    };
}

export default connect(mapStateToProps)(RemoveMemberButton);
