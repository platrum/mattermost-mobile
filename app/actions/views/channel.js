// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {batchActions} from 'redux-batched-actions';

import {ViewTypes} from 'app/constants';

import {UserTypes} from 'mattermost-redux/action_types';
import {
    fetchMyChannelsAndMembers,
    getChannelStats,
    getMyChannelMembers,
    selectChannel,
    leaveChannel as serviceLeaveChannel
} from 'mattermost-redux/actions/channels';
import {getPosts, getPostsSince} from 'mattermost-redux/actions/posts';
import {getFilesForPost} from 'mattermost-redux/actions/files';
import {savePreferences, deletePreferences} from 'mattermost-redux/actions/preferences';
import {getTeamMembersByIds} from 'mattermost-redux/actions/teams';
import {getProfilesInChannel} from 'mattermost-redux/actions/users';
import {General, Posts, Preferences} from 'mattermost-redux/constants';
import {
    getChannelByName,
    getDirectChannelName,
    getUserIdFromChannelName,
    isDirectChannelVisible,
    isGroupChannelVisible,
    isDirectChannel,
    isGroupChannel
} from 'mattermost-redux/utils/channel_utils';
import {getLastUpdateAt} from 'mattermost-redux/utils/post_utils';
import {getPreferencesByCategory} from 'mattermost-redux/utils/preference_utils';

export function loadChannelsIfNecessary(teamId) {
    return async (dispatch, getState) => {
        const {channels} = getState().entities.channels;

        let hasChannelsForTeam = false;
        for (const channel of Object.values(channels)) {
            if (channel.team_id === teamId) {
                // If we have one channel, assume we have all of them
                hasChannelsForTeam = true;
                break;
            }
        }

        if (hasChannelsForTeam) {
            await getMyChannelMembers(teamId)(dispatch, getState);
        } else {
            await fetchMyChannelsAndMembers(teamId)(dispatch, getState);
        }
    };
}

export function loadProfilesAndTeamMembersForDMSidebar(teamId) {
    return async (dispatch, getState) => {
        const state = getState();
        const {currentUserId} = state.entities.users;
        const {channels, myMembers} = state.entities.channels;
        const {myPreferences} = state.entities.preferences;
        const {membersInTeam} = state.entities.teams;
        const dmPrefs = getPreferencesByCategory(myPreferences, Preferences.CATEGORY_DIRECT_CHANNEL_SHOW);
        const gmPrefs = getPreferencesByCategory(myPreferences, Preferences.CATEGORY_GROUP_CHANNEL_SHOW);
        const members = [];
        const loadProfilesForChannels = [];
        const prefs = [];

        function buildPref(name) {
            return {
                user_id: currentUserId,
                category: Preferences.CATEGORY_DIRECT_CHANNEL_SHOW,
                name,
                value: 'true'
            };
        }

        // Find DM's and GM's that need to be shown
        const directChannels = Object.values(channels).filter((c) => (isDirectChannel(c) || isGroupChannel(c)));
        directChannels.forEach((channel) => {
            const member = myMembers[channel.id];
            if (isDirectChannel(channel) && !isDirectChannelVisible(currentUserId, myPreferences, channel) && member.mention_count > 0) {
                const teammateId = getUserIdFromChannelName(currentUserId, channel.name);
                let pref = dmPrefs.get(teammateId);
                if (pref) {
                    pref = {...pref, value: 'true'};
                } else {
                    pref = buildPref(teammateId);
                }
                dmPrefs.set(teammateId, pref);
                prefs.push(pref);
            } else if (isGroupChannel(channel) && !isGroupChannelVisible(myPreferences, channel) && (member.mention_count > 0 || member.msg_count < channel.total_msg_count)) {
                const id = channel.id;
                let pref = gmPrefs.get(id);
                if (pref) {
                    pref = {...pref, value: 'true'};
                } else {
                    pref = buildPref(id);
                }
                gmPrefs.set(id, pref);
                prefs.push(pref);
            }
        });

        if (prefs.length) {
            savePreferences(currentUserId, prefs)(dispatch, getState);
        }

        for (const [key, pref] of dmPrefs) {
            if (pref.value === 'true') {
                members.push(key);
            }
        }

        for (const [key, pref] of gmPrefs) {
            if (pref.value === 'true') {
                loadProfilesForChannels.push(key);
            }
        }

        if (loadProfilesForChannels.length) {
            for (let i = 0; i < loadProfilesForChannels.length; i++) {
                const channelId = loadProfilesForChannels[i];
                getProfilesInChannel(channelId, 0)(dispatch, getState);
            }
        }

        let membersToLoad = members;
        if (membersInTeam[teamId]) {
            membersToLoad = members.filter((m) => !membersInTeam[teamId].hasOwnProperty(m));
        }

        if (membersToLoad.length) {
            getTeamMembersByIds(teamId, membersToLoad)(dispatch, getState);
        }

        const actions = [];
        for (let i = 0; i < members.length; i++) {
            const channelName = getDirectChannelName(currentUserId, members[i]);
            const channel = getChannelByName(channels, channelName);
            if (channel) {
                actions.push({
                    type: UserTypes.RECEIVED_PROFILE_IN_CHANNEL,
                    data: {user_id: members[i]},
                    id: channel.id
                });
            }
        }

        if (actions.length) {
            dispatch(batchActions(actions), getState);
        }
    };
}

export function loadPostsIfNecessary(channel) {
    return async (dispatch, getState) => {
        const state = getState();
        const {posts, postsInChannel} = state.entities.posts;
        const postsIds = postsInChannel[channel.id];

        // Get the first page of posts if it appears we haven't gotten it yet, like the webapp
        if (!postsIds || postsIds.length < Posts.POST_CHUNK_SIZE) {
            return getPosts(channel.id)(dispatch, getState);
        }

        const postsForChannel = postsIds.map((id) => posts[id]);
        const latestPostTime = getLastUpdateAt(postsForChannel);

        if (latestPostTime) {
            return getPostsSince(channel.id, latestPostTime)(dispatch, getState);
        }

        return null;
    };
}

export function loadFilesForPostIfNecessary(post) {
    return async (dispatch, getState) => {
        const {files} = getState().entities;
        const fileIdsForPost = files.fileIdsByPostId[post.id];

        if (!fileIdsForPost) {
            await getFilesForPost(post.id)(dispatch, getState);
        }
    };
}

export function selectInitialChannel(teamId) {
    return async (dispatch, getState) => {
        const state = getState();
        const {channels, currentChannelId, myMembers} = state.entities.channels;
        const {currentUserId} = state.entities.users;
        const currentChannel = channels[currentChannelId];
        const {myPreferences} = state.entities.preferences;

        const isDMVisible = currentChannel && currentChannel.type === General.DM_CHANNEL &&
            isDirectChannelVisible(currentUserId, myPreferences, currentChannel);

        const isGMVisible = currentChannel && currentChannel.type === General.GM_CHANNEL &&
            isGroupChannelVisible(myPreferences, currentChannel);

        if (currentChannel && myMembers[currentChannelId] &&
            (currentChannel.team_id === teamId || isDMVisible || isGMVisible)) {
            await handleSelectChannel(currentChannelId)(dispatch, getState);
            return;
        }

        const channel = Object.values(channels).find((c) => c.team_id === teamId && c.name === General.DEFAULT_CHANNEL);
        if (channel) {
            await handleSelectChannel(channel.id)(dispatch, getState);
        } else {
            // Handle case when the default channel cannot be found
            // so we need to get the first available channel of the team
            const channelsInTeam = Object.values(channels).filter((c) => c.team_id === teamId);
            const firstChannel = channelsInTeam[0].id;
            await handleSelectChannel(firstChannel.id)(dispatch, getState);
        }
    };
}

export function handleSelectChannel(channelId) {
    return async (dispatch, getState) => {
        const {currentTeamId} = getState().entities.teams;

        dispatch({
            type: ViewTypes.SET_LAST_CHANNEL_FOR_TEAM,
            teamId: currentTeamId,
            channelId
        });
        getChannelStats(channelId)(dispatch, getState);
        selectChannel(channelId)(dispatch, getState);
    };
}

export function handlePostDraftChanged(channelId, postDraft) {
    return async (dispatch, getState) => {
        dispatch({
            type: ViewTypes.POST_DRAFT_CHANGED,
            channelId,
            postDraft
        }, getState);
    };
}

export function toggleDMChannel(otherUserId, visible) {
    return async (dispatch, getState) => {
        const state = getState();
        const {currentUserId} = state.entities.users;

        const dm = [{
            user_id: currentUserId,
            category: Preferences.CATEGORY_DIRECT_CHANNEL_SHOW,
            name: otherUserId,
            value: visible
        }];

        savePreferences(currentUserId, dm)(dispatch, getState);
    };
}

export function toggleGMChannel(channelId, visible) {
    return async (dispatch, getState) => {
        const state = getState();
        const {currentUserId} = state.entities.users;

        const gm = [{
            user_id: currentUserId,
            category: Preferences.CATEGORY_GROUP_CHANNEL_SHOW,
            name: channelId,
            value: visible
        }];

        savePreferences(currentUserId, gm)(dispatch, getState);
    };
}

export function closeDMChannel(channel) {
    return async(dispatch, getState) => {
        const state = getState();

        if (channel.isFavorite) {
            unmarkFavorite(channel.id)(dispatch, getState);
        }

        toggleDMChannel(channel.teammate_id, 'false')(dispatch, getState);
        if (channel.isCurrent) {
            selectInitialChannel(state.entities.teams.currentTeamId)(dispatch, getState);
        }
    };
}

export function closeGMChannel(channel) {
    return async(dispatch, getState) => {
        const state = getState();

        if (channel.isFavorite) {
            unmarkFavorite(channel.id)(dispatch, getState);
        }

        toggleGMChannel(channel.id, 'false')(dispatch, getState);
        if (channel.isCurrent) {
            selectInitialChannel(state.entities.teams.currentTeamId)(dispatch, getState);
        }
    };
}

export function closeDirectChannel(channel) {
    return async (dispatch, getState) => {
        switch (channel.type) {
        case General.DM_CHANNEL:
            return closeDMChannel(channel)(dispatch, getState);
        case General.GM_CHANNEL:
            return closeGMChannel(channel)(dispatch, getState);
        }

        return null;
    };
}

export function markFavorite(channelId) {
    return async (dispatch, getState) => {
        const {currentUserId} = getState().entities.users;
        const fav = [{
            user_id: currentUserId,
            category: Preferences.CATEGORY_FAVORITE_CHANNEL,
            name: channelId,
            value: 'true'
        }];

        savePreferences(currentUserId, fav)(dispatch, getState);
    };
}

export function unmarkFavorite(channelId) {
    return async (dispatch, getState) => {
        const {currentUserId} = getState().entities.users;
        const fav = [{
            user_id: currentUserId,
            category: Preferences.CATEGORY_FAVORITE_CHANNEL,
            name: channelId
        }];

        deletePreferences(currentUserId, fav)(dispatch, getState);
    };
}

export function leaveChannel(channel, reset = false) {
    return async (dispatch, getState) => {
        const {currentTeamId} = getState().entities.teams;
        await serviceLeaveChannel(channel.id)(dispatch, getState);
        if (channel.isCurrent || reset) {
            await selectInitialChannel(currentTeamId)(dispatch, getState);
        }
    };
}

export function setChannelLoading(loading = true) {
    return {
        type: ViewTypes.SET_CHANNEL_LOADER,
        loading
    };
}
