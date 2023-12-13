// This control is based on Leonti's Stack Overflow post:
// http://stackoverflow.com/users/219449/leonti
// http://stackoverflow.com/questions/36368919/scrollable-image-with-pinch-to-zoom

import React, {Component, PropTypes} from 'react';
import {
  View,
  PanResponder
} from 'react-native';

import FileAttachmentImage from 'app/components/file_attachment_list/file_attachment_image';

function calcDistance(x1, y1, x2, y2) {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
}

function calcCenter(x1, y1, x2, y2) {
    function middle(p1, p2) {
        return p1 > p2 ? p1 - (p1 - p2) / 2 : p2 - (p2 - p1) / 2; // eslint-disable-line
    }

    return {
        x: middle(x1, x2),
        y: middle(y1, y2)
    };
}

function maxOffset(offset, windowDimension, imageDimension) {
    const max = windowDimension - imageDimension;
    if (max >= 0) {
        return 0;
    }
    return offset < max ? max : offset;
}

function calcOffsetByZoom(width, height, imageWidth, imageHeight, zoom) {
    const xDiff = (imageWidth * zoom) - width;
    const yDiff = (imageHeight * zoom) - height;
    return {
        left: -xDiff / 2,
        top: -yDiff / 2
    };
}

class ZoomableImage extends Component {
    static propTypes = {
        addFileToFetchCache: PropTypes.func.isRequired,
        fetchCache: PropTypes.object.isRequired,
        file: PropTypes.object.isRequired,
        imageHeight: PropTypes.number.isRequired,
        imageWidth: PropTypes.number.isRequired,
        onImageTap: PropTypes.func,
        onZoom: PropTypes.func.isRequired,
        wrapperHeight: PropTypes.number.isRequired,
        wrapperWidth: PropTypes.number.isRequired,
        theme: PropTypes.object.isRequired
    };

    static defaultProps = {
        onImageTap: () => false
    };

    constructor(props) {
        super(props);

        this.onLayout = this.onLayout.bind(this);

        this.state = {
            zoom: 1,
            maxZoom: 3,
            minZoom: 1,
            layoutKnown: false,
            isZooming: false,
            isMoving: false,
            initialDistance: 0,
            initialX: 0,
            initalY: 0,
            offsetTop: 0,
            offsetLeft: 0,
            initialTop: 0,
            initialLeft: 0,
            initialTopWithoutZoom: 0,
            initialLeftWithoutZoom: 0,
            initialZoom: 1,
            top: 0,
            left: 0,
            height: props.wrapperHeight,
            width: props.wrapperWidth
        };
    }

    componentWillMount() {
        this.panResponder = PanResponder.create({
            onStartShouldSetPanResponder: () => {
                this.tap = Date.now();

                return true;
            },
            onStartShouldSetPanResponderCapture: (evt, gestureState) => {
                if (gestureState.numberActiveTouches === 2 || this.state.zoom > 1) {
                    // Store each press for double tap detection
                    /*if (!this.lastPress) {
                        this.lastPress = Date.now();
                    } else if (Date.now() - this.lastPress < 400 && Date.now() - this.lastPress > 100) {
                        this.setState({
                            zoom: 1,
                            top: 0,
                            offsetTop: 0,
                            left: 0,
                            offsetLeft: 0
                        });
                        this.props.onZoom(false);
                        this.lastPress = null;

                        return false;
                    }*/

                    this.lastPress = Date.now();

                    this.props.onZoom(true);
                    return true;
                }

                return false;
            },
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                return gestureState.numberActiveTouches === 2 || this.state.zoom > 1;
            },
            onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
                return gestureState.numberActiveTouches === 2 || this.state.zoom > 1;
            },
            onPanResponderGrant: () => {
                return;
            },
            onPanResponderMove: (evt) => {
                const touches = evt.nativeEvent.touches;

                if (touches.length === 2) {
                    const touch1 = touches[0];
                    const touch2 = touches[1];

                    this.processPinch(touch1.pageX, touch1.pageY,
                        touch2.pageX, touch2.pageY);
                } else if (touches.length === 1 && !this.state.isZooming) {
                    this.processTouch(touches[0].pageX, touches[0].pageY);
                }
            },
            onPanResponderTerminationRequest: () => {
                return this.state.zoom === 1;
            },
            onPanResponderRelease: () => {
                this.props.onZoom(this.state.zoom > 1);
                this.setState({
                    isZooming: false,
                    isMoving: false
                });
            },
            onPanResponderTerminate: () => {
                return;
            },
            onShouldBlockNativeResponder: () => false
        });
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.wrapperWidth !== this.state.width || nextProps.wrapperHeight !== this.state.height) {
            this.setState({
                height: nextProps.wrapperHeight,
                width: nextProps.wrapperWidth
            });
        }
    }

    zoomIn = (zoom = 2) => {
        const offsetByZoom = calcOffsetByZoom(this.state.width, this.state.height,
                        this.props.wrapperWidth, this.props.wrapperHeight, zoom);

        this.setState({
            zoom,
            left: offsetByZoom.left,
            top: offsetByZoom.top,
            initialX: this.state.width / 2,
            initialY: this.state.height / 2,
            initialZoom: zoom,
            initialTopWithoutZoom: this.state.top - offsetByZoom.top,
            initialLeftWithoutZoom: this.state.left - offsetByZoom.left
        });
        this.props.onZoom(true);
    }

    processPinch(x1, y1, x2, y2) {
        const distance = calcDistance(x1, y1, x2, y2);
        const center = calcCenter(x1, y1, x2, y2);

        if (this.state.isZooming) {
            const touchZoom = distance / this.state.initialDistance;
            const zoom = touchZoom * this.state.initialZoom > this.state.minZoom ? touchZoom * this.state.initialZoom : this.state.minZoom;
            if (zoom > this.state.maxZoom) {
                return;
            }
            const offsetByZoom = calcOffsetByZoom(this.state.width, this.state.height,
                this.props.wrapperWidth, this.props.wrapperHeight, zoom);
            const left = (this.state.initialLeftWithoutZoom * touchZoom) + offsetByZoom.left;
            const top = (this.state.initialTopWithoutZoom * touchZoom) + offsetByZoom.top;

            this.setState({
                zoom,
                left: left > 0 ? 0 : maxOffset(left, this.state.width, this.props.wrapperWidth * zoom),
                top: top > 0 ? 0 : maxOffset(top, this.state.height, this.props.wrapperHeight * zoom)
            });
        } else {
            const offsetByZoom = calcOffsetByZoom(this.state.width, this.state.height,
                            this.props.wrapperWidth, this.props.wrapperHeight, this.state.zoom);
            this.setState({
                isZooming: true,
                initialDistance: distance,
                initialX: center.x,
                initialY: center.y,
                initialTop: this.state.top,
                initialLeft: this.state.left,
                initialZoom: this.state.zoom,
                initialTopWithoutZoom: this.state.top - offsetByZoom.top,
                initialLeftWithoutZoom: this.state.left - offsetByZoom.left
            });
        }
    }

    processTouch(x, y) {
        if (this.state.isMoving) {
            const left = this.state.initialLeft + x - this.state.initialX; // eslint-disable-line
            const top = this.state.initialTop + y - this.state.initialY; // eslint-disable-line

            this.setState({
                left: left > 0 ? 0 : maxOffset(left, this.state.width, this.props.wrapperWidth * this.state.zoom),
                top: top > 0 ? 0 : maxOffset(top, this.state.height, this.props.wrapperHeight * this.state.zoom)
            });
        } else {
            this.setState({
                isMoving: true,
                initialX: x,
                initialY: y,
                initialTop: this.state.top,
                initialLeft: this.state.left
            });
        }
    }

    onLayout(event) {
        if (this.state.layoutKnown) {
            return;
        }

        const layout = event.nativeEvent.layout;

        if (layout.width === this.state.width && layout.height === this.state.height) {
            return;
        }

        const offsetTop = 0; // eslint-disable-line

        this.setState({
            layoutKnown: true,
            width: this.props.wrapperWidth,
            height: this.props.wrapperHeight,
            offsetTop
        });
    }

    render() {
        const {
            addFileToFetchCache,
            fetchCache,
            file,
            imageHeight,
            imageWidth,
            theme,
            wrapperHeight,
            wrapperWidth
        } = this.props;

        return (
            <View
                {...this.panResponder.panHandlers}
                onResponderRelease={() => {
                    if (Date.now() - this.tap < 100) {
                        this.props.onImageTap();
                    }

                    this.props.onZoom(this.state.zoom > 1);
                    this.setState({
                        isZooming: false,
                        isMoving: false
                    });
                }}
                style={{
                    position: 'absolute',
                    top: this.state.offsetTop + this.state.top,
                    left: this.state.offsetLeft + this.state.left,
                    width: this.state.width * this.state.zoom,
                    height: this.state.height * this.state.zoom
                }}
            >
                <FileAttachmentImage
                    addFileToFetchCache={addFileToFetchCache}
                    fetchCache={fetchCache}
                    file={file}
                    theme={theme}
                    imageHeight={imageHeight * this.state.zoom}
                    imageSize='fullsize'
                    imageWidth={imageWidth * this.state.zoom}
                    resizeMode='contain'
                    wrapperBackgroundColor='#000'
                    wrapperHeight={wrapperHeight * this.state.zoom}
                    wrapperWidth={wrapperWidth * this.state.zoom}
                />
            </View>
        );
    }
}

export default ZoomableImage;
