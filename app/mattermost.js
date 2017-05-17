// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import 'babel-polyfill';
import Orientation from 'react-native-orientation';
import {Provider} from 'react-redux';
import {Navigation} from 'react-native-navigation';
import DeviceNotification from 'react-native-push-notification';
import {
    Alert,
    AppState,
    InteractionManager,
    Platform
} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import semver from 'semver';

import {setAppState, setDeviceToken} from 'mattermost-redux/actions/general';
import {logout} from 'mattermost-redux/actions/users';
import {Client4} from 'mattermost-redux/client';
import {General} from 'mattermost-redux/constants';
import EventEmitter from 'mattermost-redux/utils/event_emitter';

import {goToNotification, loadConfigAndLicense, queueNotification} from 'app/actions/views/root';
import {NavigationTypes, ViewTypes} from 'app/constants';
import initialState from 'app/initial_state';
import {registerScreens} from 'app/screens';
import configureStore from 'app/store';

import Config from 'assets/config';

const store = configureStore(initialState);
registerScreens(store, Provider);

export default class Mattermost {
    constructor() {
        this.isConfigured = false;
        Orientation.lockToPortrait();
        this.unsubscribeFromStore = store.subscribe(this.listenForHydration);
        AppState.addEventListener('change', this.handleAppStateChange);
        EventEmitter.on(General.CONFIG_CHANGED, this.handleConfigChanged);
        EventEmitter.on(NavigationTypes.NAVIGATION_RESET, this.handleReset);

        this.handleAppStateChange(AppState.currentState);
        Client4.setUserAgent(DeviceInfo.getUserAgent());
    }

    handleAppStateChange = (appState) => {
        const {dispatch, getState} = store;
        setAppState(appState === 'active')(dispatch, getState);
    };

    handleConfigChanged = (serverVersion) => {
        const {dispatch, getState} = store;
        const version = serverVersion.match(/^[0-9]*.[0-9]*.[0-9]*(-[a-zA-Z0-9.-]*)?/g)[0];
        if (serverVersion) {
            if (semver.valid(version) && semver.lt(version, Config.MinServerVersion)) {
                Alert.alert(
                    'Server upgrade required',
                    'A server upgrade is required to use the Mattermost app. Please ask your System Administrator for details.',
                    [{
                        text: 'OK',
                        onPress: this.handleVersionUpgrade
                    }]
                );
            } else {
                loadConfigAndLicense(serverVersion)(dispatch, getState);
            }
        }
    };

    handleReset = () => {
        Client4.serverVersion = '';
        this.startApp('fade');
    };

    handleVersionUpgrade = async () => {
        const {dispatch, getState} = store;

        // const {closeDrawers, logout, unrenderDrawer} = this.props.actions;

        Client4.serverVersion = '';

        // closeDrawers();
        // unrenderDrawer();
        if (getState().entities.general.credentials.token) {
            InteractionManager.runAfterInteractions(() => {
                logout()(dispatch, getState);
            });
        }
    };

    // We need to wait for hydration to occur before load the router.
    listenForHydration = () => {
        const state = store.getState();
        if (state.views.root.hydrationComplete) {
            this.unsubscribeFromStore();
            this.startApp();
        }
    };

    configurePushNotifications = () => {
        DeviceNotification.configure({
            onRegister: this.onRegisterDevice,
            onNotification: this.onPushNotification,
            senderID: Config.GooglePlaySenderId,
            popInitialNotification: true,
            requestPermissions: true
        });
    };

    onRegisterDevice = (data) => {
        const prefix = Platform.OS === 'ios' ? General.PUSH_NOTIFY_APPLE_REACT_NATIVE : General.PUSH_NOTIFY_ANDROID_REACT_NATIVE;
        const {dispatch, getState} = store;
        setDeviceToken(`${prefix}:${data.token}`)(dispatch, getState);
        this.isConfigured = true;
    };

    onPushNotification = (deviceNotification) => {
        const {foreground, userInteraction, data, message} = deviceNotification;
        let notification;

        if (Platform.OS === 'android') {
            notification = {
                data: {
                    channel_id: deviceNotification.channel_id,
                    team_id: deviceNotification.team_id
                },
                message
            };
        } else {
            notification = {
                data,
                message
            };
        }

        if (foreground) {
            EventEmitter.emit(ViewTypes.NOTIFICATION_IN_APP, notification);
        } else if (userInteraction) {
            const {dispatch, getState} = store;
            const state = getState();

            if (!state.views.root.appInitializing) {
                // go to notification if the app is initialized
                goToNotification(notification)(dispatch, getState);
                EventEmitter.emit(ViewTypes.NOTIFICATION_TAPPED);
            } else if (state.entities.general.credentials.token) {
                // queue notification if app is not initialized but we are logged in
                queueNotification(notification)(dispatch, getState);
            }
        }
    };

    startApp = (animationType = 'none') => {
        this.configurePushNotifications();

        Navigation.startSingleScreenApp({
            screen: {
                screen: 'Root',
                navigatorStyle: {
                    navBarHidden: true,
                    statusBarHidden: false,
                    statusBarHideWithNavBar: false
                }
            },
            animationType
        });
    };
}
