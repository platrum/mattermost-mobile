// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import wavToMp3 from '@bitnet-infotech/react-native-wav-to-mp3';
import {cacheDirectory, deleteAsync, getInfoAsync} from 'expo-file-system';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import AudioRecord from 'react-native-audio-record';
import Permissions from 'react-native-permissions';

import {uploadFile} from '@actions/remote/file';
import {createPost} from '@actions/remote/post';
import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {ICON_SIZE} from '@constants/post_draft';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';

import type {QuickActionAttachmentProps} from '@typings/components/post_draft_quick_action';

const style = StyleSheet.create({
    icon: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    panel: {
        minWidth: 300,
        borderRadius: 6,
        paddingHorizontal: 18,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    timerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    timerText: {
        ...typography('Heading', 200),
    },
    action: {
        ...typography('Heading', 200),
    },
});

const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const ensureFileUri = (path: string) => {
    if (path.startsWith('file://')) {
        return path;
    }
    return `file://${path}`;
};

const convertWavToMp3 = async (wavUri: string, mp3Uri: string) => {
    const output = await wavToMp3.convert(wavUri, mp3Uri, {bitrate: 128, quality: 3});
    return Boolean(output);
};

export default function VoiceQuickAction({
    channelId = '',
    currentUserId = '',
    disabled,
    rootId = '',
    testID = '',
}: QuickActionAttachmentProps) {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const [isRecording, setIsRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const secondsRef = useRef(0);
    const recordingStartMsRef = useRef(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const recordingPathRef = useRef<string | null>(null);

    const showMicPermissionAlert = useCallback(() => {
        Alert.alert(
            intl.formatMessage({
                id: 'mobile.voice.permission_title',
                defaultMessage: 'Microphone access needed',
            }),
            intl.formatMessage({
                id: 'mobile.voice.permission_body',
                defaultMessage: 'Open Settings to allow microphone access for voice messages.',
            }),
            [{
                text: intl.formatMessage({id: 'mobile.permission_denied_dismiss', defaultMessage: 'Cancel'}),
                style: 'cancel',
            }, {
                text: intl.formatMessage({id: 'mobile.permission_denied_retry', defaultMessage: 'Settings'}),
                onPress: () => Linking.openSettings(),
            }],
        );
    }, [intl]);

    const stopTimer = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const stopRecording = useCallback(async () => {
        if (!recordingPathRef.current) {
            return null;
        }
        const path = await AudioRecord.stop();
        const finalPath = path || recordingPathRef.current;
        recordingPathRef.current = null;
        stopTimer();
        return ensureFileUri(finalPath);
    }, [stopTimer]);

    const onCancel = useCallback(async () => {
        setIsRecording(false);
        const wavUri = await stopRecording();
        if (wavUri) {
            await deleteAsync(wavUri, {idempotent: true});
        }
        secondsRef.current = 0;
        setSeconds(0);
    }, [stopRecording]);

    const uploadVoiceFile = useCallback((file: ExtractedFileInfo): Promise<FileInfo> => {
        return new Promise((resolve, reject) => {
            const onComplete = (response: any) => {
                if (response.code !== 201 || !response.data?.file_infos?.length) {
                    reject(new Error('voice upload failed'));
                    return;
                }
                resolve(response.data.file_infos[0] as FileInfo);
            };
            const onError = (error: any) => reject(error);
            const {error} = uploadFile(serverUrl, file, channelId, () => undefined, onComplete, onError);
            if (error) {
                reject(error);
            }
        });
    }, [channelId, serverUrl]);

    const onSend = useCallback(async () => {
        setIsRecording(false);
        const wavUri = await stopRecording();
        if (!wavUri) {
            return;
        }

        const durationMs = recordingStartMsRef.current ? Math.max(0, Date.now() - recordingStartMsRef.current) : (secondsRef.current * 1000);
        if (durationMs < 1000) {
            await deleteAsync(wavUri, {idempotent: true});
            secondsRef.current = 0;
            setSeconds(0);
            recordingStartMsRef.current = 0;
            return;
        }

        const baseName = `${Date.now()}`;
        const mp3Uri = `${cacheDirectory}${baseName}.mp3`;
        const converted = await convertWavToMp3(wavUri, mp3Uri);
        await deleteAsync(wavUri, {idempotent: true});

        if (!converted) {
            Alert.alert(
                intl.formatMessage({
                    id: 'mobile.voice.convert_error_title',
                    defaultMessage: 'Voice conversion failed',
                }),
                intl.formatMessage({
                    id: 'mobile.voice.convert_error_body',
                    defaultMessage: 'Could not convert voice message to MP3.',
                }),
            );
            secondsRef.current = 0;
            setSeconds(0);
            return;
        }

        const fileInfo = await getInfoAsync(mp3Uri, {size: true});
        const fileSize = fileInfo.exists && 'size' in fileInfo ? (fileInfo.size || 0) : 0;
        if (fileSize <= 0) {
            secondsRef.current = 0;
            setSeconds(0);
            return;
        }

        const uploadedFile = await uploadVoiceFile({
            name: `${baseName}.mp3`,
            localPath: mp3Uri,
            uri: mp3Uri,
            size: fileSize,
            mime_type: 'audio/mpeg',
        });

        const voicePost: Partial<Post> = {
            channel_id: channelId,
            root_id: rootId,
            user_id: currentUserId,
            message: 'Voice Message',
            type: 'custom_voice' as PostType,
            props: {
                fileId: uploadedFile.id,
                duration: durationMs,
            },
        };
        const {error: postError} = await createPost(serverUrl, voicePost);
        if (postError) {
            throw postError;
        }

        secondsRef.current = 0;
        setSeconds(0);
        recordingStartMsRef.current = 0;
    }, [channelId, convertWavToMp3, currentUserId, rootId, serverUrl, stopRecording]);

    const onSendWithErrorHandling = useCallback(async () => {
        try {
            await onSend();
        } catch {
            Alert.alert(
                intl.formatMessage({
                    id: 'mobile.voice.convert_error_title',
                    defaultMessage: 'Voice conversion failed',
                }),
                intl.formatMessage({
                    id: 'mobile.voice.convert_error_body',
                    defaultMessage: 'Could not convert voice message to MP3.',
                }),
            );
        }
    }, [intl, onSend]);

    const startRecording = useCallback(async () => {
        const microphone = Platform.select({
            ios: Permissions.PERMISSIONS.IOS.MICROPHONE,
            default: Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO,
        });

        if (!microphone) {
            return;
        }

        const checkPermission = await Permissions.check(microphone);
        let granted = checkPermission === Permissions.RESULTS.GRANTED;
        if (!granted && checkPermission === Permissions.RESULTS.DENIED) {
            const requestResult = await Permissions.request(microphone);
            granted = requestResult === Permissions.RESULTS.GRANTED;
        }

        if (!granted) {
            showMicPermissionAlert();
            return;
        }

        const wavFile = `voice-${Date.now()}.wav`;
        AudioRecord.init({
            sampleRate: 16000,
            channels: 1,
            bitsPerSample: 16,
            audioSource: 6,
            wavFile,
        });

        AudioRecord.start();
        recordingPathRef.current = `${cacheDirectory}${wavFile}`;

        secondsRef.current = 0;
        setSeconds(0);
        recordingStartMsRef.current = Date.now();
        stopTimer();
        intervalRef.current = setInterval(() => {
            secondsRef.current += 1;
            setSeconds(secondsRef.current);
        }, 1000);
        setIsRecording(true);
    }, [showMicPermissionAlert, stopTimer]);

    useEffect(() => {
        return () => {
            stopTimer();
            if (recordingPathRef.current) {
                AudioRecord.stop().catch(() => null);
            }
        };
    }, [stopTimer]);

    const actionTestID = disabled ? `${testID}.disabled` : testID;
    const color = disabled ? changeOpacity(theme.centerChannelColor, 0.16) : changeOpacity(theme.centerChannelColor, 0.64);

    return (
        <>
            <TouchableWithFeedback
                testID={actionTestID}
                disabled={disabled}
                onPress={startRecording}
                style={style.icon}
                type={'opacity'}
            >
                <CompassIcon
                    color={color}
                    name='microphone'
                    size={ICON_SIZE}
                />
            </TouchableWithFeedback>
            <Modal
                animationType='fade'
                visible={isRecording}
                transparent={true}
                onRequestClose={onCancel}
            >
                <View style={style.backdrop}>
                    <View style={[style.panel, {backgroundColor: theme.centerChannelBg}]}>
                        <View style={style.timerRow}>
                            <CompassIcon
                                name='microphone'
                                size={24}
                                color='#f16d6d'
                            />
                            <Text style={[style.timerText, {color: theme.centerChannelColor}]}>
                                {formatDuration(seconds)}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onCancel}>
                            <Text style={[style.action, {color: theme.buttonBg}]}>
                                {intl.formatMessage({id: 'mobile.voice.cancel', defaultMessage: 'Отмена'})}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onSendWithErrorHandling}>
                            <Text style={[style.action, {color: theme.buttonBg}]}>
                                {intl.formatMessage({id: 'mobile.voice.send', defaultMessage: 'Отправить'})}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </>
    );
}
