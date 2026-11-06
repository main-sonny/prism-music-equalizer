export class AudioEngine {
    constructor() {
        this.element = new Audio();
        this.element.preload = "auto";
        this.context = null;
        this.url = null;
        this.beatFrequency = new Uint8Array(1024);
        this.beatSpectrum = new Float32Array(1024);
        this.bassLevel = 0;
        this.frequency = new Uint8Array(1024);
        this.wave = new Uint8Array(2048).fill(128);
        this.peaks = [];
        this.envelope = 1;
    }

    async init() {
        if (!this.context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) throw new Error("Web Audio is unavailable in this browser. Try Chrome or Edge.");
            this.context = new AudioContext();
            this.source = this.context.createMediaElementSource(this.element);
            this.bass = this.context.createBiquadFilter();
            this.bass.type = "lowshelf";
            this.bass.frequency.value = 180;
            this.mid = this.context.createBiquadFilter();
            this.mid.type = "peaking";
            this.mid.frequency.value = 1200;
            this.mid.Q.value = 0.7;
            this.treble = this.context.createBiquadFilter();
            this.treble.type = "highshelf";
            this.treble.frequency.value = 4000;
            this.compressor = this.context.createDynamicsCompressor();
            this.compressor.threshold.value = -8;
            this.compressor.knee.value = 12;
            this.compressor.ratio.value = 6;
            this.master = this.context.createGain();
            this.fade = this.context.createGain();
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = 2048;
            this.beatAnalyser = this.context.createAnalyser();
            this.beatAnalyser.fftSize = 2048;
            this.beatAnalyser.smoothingTimeConstant = 0;
            this.beatAnalyser.maxDecibels = -10;
            this.beatAnalyser.minDecibels = -90;
            this.monitor = this.context.createGain();
            this.output = this.context.createMediaStreamDestination();
            this.source
                .connect(this.bass)
                .connect(this.mid)
                .connect(this.treble)
                .connect(this.compressor)
                .connect(this.master)
                .connect(this.fade)
                .connect(this.beatAnalyser)
                .connect(this.analyser);
            this.analyser.connect(this.monitor).connect(this.context.destination);
            this.analyser.connect(this.output);
        }
        if (this.context.state !== "running") await this.context.resume();
    }

    async load(blob) {
        this.element.pause();
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(blob);
        this.element.src = this.url;
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => finish(new Error("Audio took too long to load. Try a smaller MP3.")),
                20000
            );
            const success = () => finish();
            const failure = () => finish(new Error("This audio format could not be decoded. Try an MP3 or WAV file."));
            const finish = (error) => {
                clearTimeout(timeout);
                this.element.removeEventListener("loadedmetadata", success);
                this.element.removeEventListener("error", failure);
                error ? reject(error) : resolve();
            };
            this.element.addEventListener("loadedmetadata", success, { once: true });
            this.element.addEventListener("error", failure, { once: true });
            this.element.load();
        });
        if (!Number.isFinite(this.element.duration) || this.element.duration <= 0)
            throw new Error("The audio has no valid duration.");
        return this.element.duration;
    }

    async createPeaks(blob) {
        const Decoder = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!Decoder || blob.size > 100 * 1024 * 1024) return [];
        try {
            const decoder = new Decoder(1, 1, 22050);
            const buffer = await decoder.decodeAudioData(await blob.arrayBuffer());
            const samples = buffer.getChannelData(0);
            const count = 240;
            const step = Math.max(1, Math.floor(samples.length / count));
            const peaks = Array.from({ length: count }, (_, i) => {
                let max = 0;
                for (
                    let j = i * step;
                    j < Math.min(samples.length, (i + 1) * step);
                    j += Math.max(1, Math.floor(step / 100))
                )
                    max = Math.max(max, Math.abs(samples[j]));
                return max;
            });
            const max = Math.max(...peaks, 0.01);
            this.peaks = peaks.map((p) => p / max);
            return this.peaks;
        } catch {
            return [];
        }
    }

    update(settings) {
        if (!this.context) return;
        const at = this.context.currentTime;
        for (const key of ["bass", "mid", "treble"]) this[key].gain.setTargetAtTime(Number(settings[key]), at, 0.025);
        this.master.gain.setTargetAtTime(Number(settings.volume), at, 0.025);
        this.analyser.smoothingTimeConstant = Number(settings.smoothing);
    }

    setEnvelope(value, immediate = false) {
        this.envelope = value;
        if (!this.fade) return;
        if (immediate) {
            this.fade.gain.cancelScheduledValues(this.context.currentTime);
            this.fade.gain.setValueAtTime(value, this.context.currentTime);
        } else this.fade.gain.setTargetAtTime(value, this.context.currentTime, 0.015);
    }

    sample() {
        if (this.analyser) {
            this.beatAnalyser.getByteFrequencyData(this.beatFrequency);
            this.beatAnalyser.getFloatFrequencyData(this.beatSpectrum);
            const binHz = this.context.sampleRate / this.beatAnalyser.fftSize;
            const first = Math.max(1, Math.floor(35 / binHz));
            const last = Math.min(this.beatSpectrum.length - 1, Math.ceil(180 / binHz));
            let power = 0;
            for (let i = first; i <= last; i++) power += Math.pow(10, this.beatSpectrum[i] / 10);
            this.bassLevel = Math.sqrt(power) * 2;
            this.analyser.getByteFrequencyData(this.frequency);
            this.analyser.getByteTimeDomainData(this.wave);
        }
        return {
            frequency: this.frequency,
            beatFrequency: this.beatFrequency,
            bassLevel: this.bassLevel,
            wave: this.wave,
        };
    }

    async seek(time) {
        const value = Math.max(0, Math.min(this.element.duration || 0, time));
        if (Math.abs(this.element.currentTime - value) < 0.005) return;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => finish(new Error("Audio seek timed out.")), 5000);
            const done = () => finish();
            const finish = (error) => {
                clearTimeout(timer);
                this.element.removeEventListener("seeked", done);
                error ? reject(error) : resolve();
            };
            this.element.addEventListener("seeked", done, { once: true });
            this.element.currentTime = value;
        });
    }

    async play(settings) {
        await this.init();
        this.update(settings);
        await this.element.play();
    }

    pause() {
        this.element.pause();
    }
}
