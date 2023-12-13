// Copyright (c) 2016 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {NavigationTypes} from 'app/constants';
import Routes from 'app/navigation/routes';
import {Constants} from 'service/constants';
import {selectPost} from 'service/actions/posts';

export function goBack() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_POP
        }, getState);
    };
}

export function closeDrawers() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_CLOSE_DRAWERS
        }, getState);
    };
}

export function goToLogin() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: Routes.Login
        }, getState);
    };
}

export function goToLoginOptions() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: Routes.LoginOptions
        }, getState);
    };
}

export function goToMfa() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: Routes.Mfa
        }, getState);
    };
}

export function goToSaml() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: Routes.Saml
        }, getState);
    };
}

export function goToLoadTeam() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: Routes.LoadTeam
        }, getState);
    };
}

export function goToModalSelectTeam() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_MODAL,
            route: Routes.SelectTeam
        }, getState);
    };
}

export function goToChannelInfo() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: Routes.ChannelInfo
        }, getState);
    };
}

export function goToChannelMembers() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: Routes.ChannelMembers
        }, getState);
    };
}

export function goToChannelAddMembers() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: Routes.ChannelAddMembers
        }, getState);
    };
}

export function goToThread(channelId, rootId) {
    return async (dispatch, getState) => {
        selectPost(rootId)(dispatch, getState);

        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: {
                ...Routes.Thread,
                key: Routes.Thread.key + rootId,
                props: {
                    channelId,
                    rootId
                }
            }
        }, getState);
    };
}

export function goToUserProfile(userId) {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_PUSH,
            route: {
                ...Routes.UserProfile,
                props: {
                    userId
                }
            }
        }, getState);
    };
}

export function openChannelDrawer() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_OPEN_LEFT_DRAWER,
            route: Routes.ChannelDrawer
        }, getState);
    };
}

export function openRightMenuDrawer() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_OPEN_RIGHT_DRAWER,
            route: Routes.RightMenuDrawer
        }, getState);
    };
}

export function showOptionsModal(title, options) {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_MODAL,
            route: Routes.OptionsModal,
            props: {
                title,
                options
            }
        }, getState);
    };
}

export function showMoreChannelsModal() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_MODAL,
            route: Routes.MoreChannels
        }, getState);
    };
}

export function showDirectMessagesModal() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_MODAL,
            route: Routes.MoreDirectMessages
        }, getState);
    };
}

export function closeModal() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_CLOSE_MODAL
        }, getState);
    };
}

export function goToModalAccountSettings() {
    return async (dispatch, getState) => {
        dispatch({
            type: NavigationTypes.NAVIGATION_MODAL,
            route: Routes.AccountSettings
        }, getState);
    };
}

export function goToCreateChannel(channelType) {
    return async (dispatch, getState) => {
        closeDrawers()(dispatch, getState);
        let type;
        let route;
        switch (channelType) {
        case Constants.OPEN_CHANNEL:
            type = NavigationTypes.NAVIGATION_PUSH;
            route = Routes.CreatePublicChannel;
            break;
        case Constants.PRIVATE_CHANNEL:
            type = NavigationTypes.NAVIGATION_MODAL;
            route = Routes.CreatePrivateChannel;
            break;
        default:
            return;
        }

        dispatch({
            type,
            route,
            props: {
                channelType
            }
        }, getState);
    };
}
