// Copyright (c) 2017 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import React, {
    Component,
    PropTypes
} from 'react';

import {
    View,
    Image,
    StyleSheet
} from 'react-native';

import * as Utils from 'mattermost-redux/utils/file_utils';

import audioIcon from 'assets/images/icons/audio.png';
import codeIcon from 'assets/images/icons/code.png';
import excelIcon from 'assets/images/icons/excel.png';
import genericIcon from 'assets/images/icons/generic.png';
import imageIcon from 'assets/images/icons/image.png';
import patchIcon from 'assets/images/icons/patch.png';
import pdfIcon from 'assets/images/icons/pdf.png';
import pptIcon from 'assets/images/icons/ppt.png';
import videoIcon from 'assets/images/icons/video.png';
import wordIcon from 'assets/images/icons/word.png';

const ICON_PATH_FROM_FILE_TYPE = {
    audio: audioIcon,
    code: codeIcon,
    image: imageIcon,
    other: genericIcon,
    patch: patchIcon,
    pdf: pdfIcon,
    presentation: pptIcon,
    spreadsheet: excelIcon,
    video: videoIcon,
    word: wordIcon
};

export default class FileAttachmentIcon extends Component {
    static propTypes = {
        file: PropTypes.object.isRequired,
        iconHeight: PropTypes.number,
        iconWidth: PropTypes.number,
        wrapperHeight: PropTypes.number,
        wrapperWidth: PropTypes.number
    };

    static defaultProps = {
        iconHeight: 60,
        iconWidth: 60,
        wrapperHeight: 100,
        wrapperWidth: 100
    }

    getFileIconPath(file) {
        const fileType = Utils.getFileType(file);
        return ICON_PATH_FROM_FILE_TYPE[fileType] || ICON_PATH_FROM_FILE_TYPE.other;
    }

    render() {
        const {file, iconHeight, iconWidth, wrapperHeight, wrapperWidth} = this.props;
        const source = this.getFileIconPath(file);

        return (
            <View style={[styles.fileIconWrapper, {height: wrapperHeight, width: wrapperWidth}]}>
                <Image
                    style={{height: iconHeight, width: iconWidth}}
                    source={source}
                    defaultSource={genericIcon}
                />
            </View>
        );
    }
}

const styles = StyleSheet.create({
    fileIconWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff'
    }
});
