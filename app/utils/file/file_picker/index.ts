// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IntlShape} from 'react-intl';
import {Alert, DeviceEventEmitter, NativeModules, Platform, StatusBar} from 'react-native';
import AndroidOpenSettings from 'react-native-android-open-settings';
import DeviceInfo from 'react-native-device-info';
import DocumentPicker, {DocumentPickerResponse} from 'react-native-document-picker';
import {Asset, CameraOptions, ImageLibraryOptions, ImagePickerResponse, launchCamera, launchImageLibrary} from 'react-native-image-picker';
import Permissions, {AndroidPermission, IOSPermission} from 'react-native-permissions';

import {Navigation} from '@constants';
import {extractFileInfo, lookupMimeType} from '@utils/file';

const ShareExtension = NativeModules.MattermostShare;

type PermissionSource = 'camera' | 'storage' | 'denied_android' | 'denied_ios' | 'photo';

export default class FilePickerUtil {
    private readonly uploadFiles: (files: ExtractedFileInfo[]) => void;
    private readonly intl: IntlShape;

    constructor(
        intl: IntlShape,
        uploadFiles: (files: ExtractedFileInfo[]) => void) {
        this.intl = intl;
        this.uploadFiles = uploadFiles;
    }

    private getPermissionMessages = (source: PermissionSource) => {
        const {formatMessage} = this.intl;
        const applicationName = DeviceInfo.getApplicationName();

        const permissions: Record<string, { title: string; text: string }> = {
            camera: {
                title: formatMessage(
                    {
                        id: 'mobile.camera_photo_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your camera',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.camera_photo_permission_denied_description',
                    defaultMessage:
                        'Take photos and upload them to your server or save them to your device. Open Settings to grant {applicationName} Read and Write access to your camera.',
                }),
            },
            storage: {
                title: formatMessage(
                    {
                        id: 'mobile.storage_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your files',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.storage_permission_denied_description',
                    defaultMessage:
                        'Upload files to your server. Open Settings to grant {applicationName} Read and Write access to files on this device.',
                }),
            },
            denied_ios: {
                title: formatMessage(
                    {
                        id: 'mobile.ios.photos_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your photos',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.ios.photos_permission_denied_description',
                    defaultMessage:
                        'Upload photos and videos to your server or save them to your device. Open Settings to grant {applicationName} Read and Write access to your photo and video library.',
                }),
            },
            denied_android: {
                title: formatMessage(
                    {
                        id: 'mobile.android.photos_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your photos',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.android.photos_permission_denied_description',
                    defaultMessage:
                        'Upload photos to your server or save them to your device. Open Settings to grant {applicationName} Read and Write access to your photo library.',
                }),
            },
        };

        return permissions[source];
    };

    private prepareFileUpload = async (files: Array<Asset | DocumentPickerResponse>) => {
        const out = await extractFileInfo(files);

        if (out.length > 0) {
            DeviceEventEmitter.emit(Navigation.NAVIGATION_CLOSE_MODAL);
            this.uploadFiles(out);
        }
    };

    private getPermissionDeniedMessage = (source?: PermissionSource) => {
        const sources = ['camera', 'storage', 'photo'];
        const deniedSource: PermissionSource = Platform.select({android: 'denied_android', ios: 'denied_ios'})!;
        const msgForSource = source && sources.includes(source) ? source : deniedSource;

        return this.getPermissionMessages(msgForSource);
    };

    private getFilesFromResponse = async (response: ImagePickerResponse): Promise<Asset[]> => {
        if (!response?.assets?.length) {
            return [];
        }

        const files: Asset[] = [];

        await Promise.all((response.assets.map(async (file) => {
            if (Platform.OS === 'ios') {
                files.push(file);
            } else {
                // For android we need to retrieve the realPath in case the file being imported is from the cloud
                const uri = (await ShareExtension.getFilePath(file.uri)).filePath;
                const type = file.type || lookupMimeType(uri);
                let fileName = file.fileName;
                if (type.includes('video/')) {
                    fileName = uri.split('\\').pop().split('/').pop();
                }

                if (uri) {
                    files.push({...file, fileName, uri, type});
                }
            }
        })));

        return files;
    };

    private hasPhotoPermission = async (source: PermissionSource) => {
        let permissionRequest;

        const targetSource = Platform.select({
            ios: source === 'camera' ? Permissions.PERMISSIONS.IOS.CAMERA : Permissions.PERMISSIONS.IOS.PHOTO_LIBRARY,
            android: Permissions.PERMISSIONS.ANDROID.CAMERA,
        }) as AndroidPermission | IOSPermission;

        const hasPhotoLibraryPermission = await Permissions.check(targetSource);

        switch (hasPhotoLibraryPermission) {
            case Permissions.RESULTS.DENIED:
                permissionRequest = await Permissions.request(targetSource);
                if (permissionRequest !== Permissions.RESULTS.GRANTED) {
                    return false;
                }
                break;
            case Permissions.RESULTS.BLOCKED: {
                const grantOption = {
                    text: this.intl.formatMessage({
                        id: 'mobile.permission_denied_retry',
                        defaultMessage: 'Settings',
                    }),
                    onPress: () => Permissions.openSettings(),
                };

                const {title, text} = this.getPermissionDeniedMessage(source);

                Alert.alert(title, text, [
                    grantOption,
                    {
                        text: this.intl.formatMessage({
                            id: 'mobile.permission_denied_dismiss',
                            defaultMessage: "Don't Allow",
                        }),
                    },
                ]);
                return false;
            }
            default: return true;
        }
        return false;
    };

    private hasStoragePermission = async () => {
        if (Platform.OS === 'ios') {
            return true;
        }

        const storagePermission = Permissions.PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE;
        let permissionRequest;
        const hasPermissionToStorage = await Permissions.check(storagePermission);
        switch (hasPermissionToStorage) {
            case Permissions.RESULTS.DENIED:
                permissionRequest = await Permissions.request(storagePermission);
                if (permissionRequest !== Permissions.RESULTS.GRANTED) {
                    return false;
                }
                break;
            case Permissions.RESULTS.BLOCKED: {
                const {title, text} = this.getPermissionDeniedMessage();

                Alert.alert(title, text, [
                    {
                        text: this.intl.formatMessage({
                            id: 'mobile.permission_denied_dismiss',
                            defaultMessage: "Don't Allow",
                        }),
                    },
                    {
                        text: this.intl.formatMessage({
                            id: 'mobile.permission_denied_retry',
                            defaultMessage: 'Settings',
                        }),
                        onPress: () => AndroidOpenSettings.appDetailsSettings(),
                    },
                ]);
                return false;
            }
            default: return true;
        }

        return false;
    };

    private buildUri = async (doc: DocumentPickerResponse) => {
        let uri: string = doc.uri;

        if (Platform.OS === 'android') {
            // For android we need to retrieve the realPath in case the file being imported is from the cloud
            const newUri = await ShareExtension.getFilePath(doc.uri);
            uri = newUri?.filePath;
            if (uri === undefined) {
                return {doc: undefined};
            }
        }

        // Decode file uri to get the actual path
        doc.uri = decodeURIComponent(uri);
        return {doc};
    };

    attachFileFromCamera = async (customOptions?: CameraOptions) => {
        let options = customOptions;
        if (!options) {
            options = {
                quality: 0.8,
                videoQuality: 'high',
                mediaType: 'photo',
                saveToPhotos: true,
            };
        }

        const hasCameraPermission = await this.hasPhotoPermission('camera');
        if (hasCameraPermission) {
            launchCamera(options, async (response: ImagePickerResponse) => {
                StatusBar.setHidden(false);

                if (response.errorCode || response.didCancel) {
                    return;
                }

                const files = await this.getFilesFromResponse(response);
                await this.prepareFileUpload(files);
            });
        }
    };

    attachFileFromFiles = async (browseFileType?: string, allowMultiSelection = false) => {
        const hasPermission = await this.hasStoragePermission();
        const fileType = browseFileType ?? Platform.select({ios: 'public.item', default: '*/*'});

        if (hasPermission) {
            try {
                const docResponse = (await DocumentPicker.pick({allowMultiSelection, type: [fileType]}));
                const proDocs = docResponse.map(async (d: DocumentPickerResponse) => {
                    const {doc} = await this.buildUri(d);
                    return doc;
                });

                const docs = await Promise.all(proDocs) as unknown as DocumentPickerResponse[];

                await this.prepareFileUpload(docs);
            } catch (error) {
                // Do nothing
            }
        }
    };

    attachFileFromPhotoGallery = async (selectionLimit = 1) => {
        const options: ImageLibraryOptions = {
            quality: 1,
            mediaType: 'mixed',
            includeBase64: false,
            selectionLimit,
        };

        const hasPermission = await this.hasPhotoPermission('photo');
        if (hasPermission) {
            launchImageLibrary(options, async (response: ImagePickerResponse) => {
                StatusBar.setHidden(false);
                if (response.errorMessage || response.didCancel) {
                    return;
                }

                const files = await this.getFilesFromResponse(response);
                await this.prepareFileUpload(files);
            });
        }
    };
}