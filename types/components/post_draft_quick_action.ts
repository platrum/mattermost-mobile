// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export interface QuickActionAttachmentProps {
    disabled: boolean;
    fileCount?: number;
    channelId?: string;
    currentUserId?: string;
    maxFilesReached: boolean;
    maxFileCount: number;
    onUploadFiles: (files: ExtractedFileInfo[]) => void;
    onVoiceReadyToSend?: () => void;
    rootId?: string;
    testID?: string;
}
