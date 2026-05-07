declare module 'react-native-audio-record' {
    type InitOptions = {
        sampleRate?: number;
        channels?: number;
        bitsPerSample?: 8 | 16;
        audioSource?: number;
        wavFile?: string;
    };

    const AudioRecord: {
        init: (options: InitOptions) => void;
        start: () => void;
        stop: () => Promise<string>;
        on: (event: string, cb: (data: string) => void) => void;
    };

    export default AudioRecord;
}
