const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function recordingSupport() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    return (
        ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"].find((type) =>
            MediaRecorder.isTypeSupported(type)
        ) || null
    );
}

export class VideoExporter {
    constructor(audio, renderer) {
        this.audio = audio;
        this.renderer = renderer;
        this.cancelled = false;
        this.job = null;
        this.controller = null;
        this.recorder = null;
    }

    async cancel() {
        this.cancelled = true;
        this.controller?.abort();
        if (this.recorder?.state === "recording") this.recorder.stop();
        this.audio.pause();
        if (this.job) await fetch(`/api/jobs/${this.job}`, { method: "DELETE" }).catch(() => {});
    }

    check() {
        if (this.cancelled) throw new DOMException("Export cancelled.", "AbortError");
    }

    async run(settings, progress) {
        const mimeType = recordingSupport();
        if (!mimeType)
            throw new Error("This browser cannot record WebM canvas video. Use the latest desktop Chrome or Edge.");
        const health = await fetch("/api/health").then((r) => r.json());
        if (!health.ffmpeg) throw new Error("Install FFmpeg and restart the local server to export MP4.");
        const duration = Number(settings.clipEnd) - Number(settings.clipStart);
        if (duration < 0.25 || duration > 7200) throw new Error("Choose a clip between 0.25 seconds and 2 hours.");
        const previousTime = this.audio.element.currentTime;
        let stream;
        let timer;
        let visibility;
        let stopFailure = null;
        try {
            progress({ stage: "preparing", percent: 0, message: "Preparing your canvas and audio…" });
            this.audio.pause();
            await this.audio.init();
            this.audio.update(settings);
            await this.audio.seek(Number(settings.clipStart));
            this.check();
            this.renderer.resize(Number(settings.width), Number(settings.height), true);
            this.renderer.exportFade = settings.videoFadeIn > 0 ? 0 : 1;
            this.audio.setEnvelope(this.renderer.exportFade, true);
            this.renderer.draw();
            const videoStream = this.renderer.canvas.captureStream(Number(settings.fps));
            stream = new MediaStream([
                ...videoStream.getVideoTracks(),
                ...this.audio.output.stream.getAudioTracks().map((track) => track.clone()),
            ]);
            const rate = Math.min(
                32000000,
                Math.max(
                    2500000,
                    settings.width *
                        settings.height *
                        settings.fps *
                        (settings.quality === "ultra" ? 0.22 : settings.quality === "draft" ? 0.07 : 0.13)
                )
            );
            const chunks = [];
            let bytes = 0;
            const recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: rate,
                audioBitsPerSecond: 192000,
            });
            this.recorder = recorder;
            const recorded = new Promise((resolve, reject) => {
                recorder.ondataavailable = (event) => {
                    if (event.data.size) {
                        chunks.push(event.data);
                        bytes += event.data.size;
                        if (bytes > 1450 * 1024 * 1024 && recorder.state === "recording") {
                            stopFailure = new Error(
                                "This recording is too large. Export a shorter clip or use a lower resolution."
                            );
                            recorder.stop();
                        }
                    }
                };
                recorder.onerror = (event) => reject(event.error || new Error("The browser stopped the recording."));
                recorder.onstop = () => resolve();
            });
            recorded.catch(() => {});
            visibility = () => {
                if (document.hidden && recorder.state === "recording") {
                    stopFailure = new Error(
                        "Recording stopped because the studio tab was hidden. Keep this tab visible during recording."
                    );
                    recorder.stop();
                }
            };
            document.addEventListener("visibilitychange", visibility);
            recorder.start(1000);
            await this.audio.element.play();
            let lastTime = this.audio.element.currentTime;
            let movedAt = performance.now();
            timer = setInterval(() => {
                const now = this.audio.element.currentTime;
                const elapsed = Math.max(0, now - Number(settings.clipStart));
                const remaining = Math.max(0, Number(settings.clipEnd) - now);
                const fade = Math.min(
                    1,
                    settings.fadeIn ? elapsed / settings.fadeIn : 1,
                    settings.fadeOut ? remaining / settings.fadeOut : 1
                );
                this.renderer.exportFade = Math.max(
                    0,
                    Math.min(
                        1,
                        settings.videoFadeIn ? elapsed / settings.videoFadeIn : 1,
                        settings.videoFadeOut ? remaining / settings.videoFadeOut : 1
                    )
                );
                this.audio.setEnvelope(fade);
                progress({
                    stage: "recording",
                    percent: Math.min(75, (elapsed / duration) * 75),
                    elapsed,
                    duration,
                    message: "Recording your visualizer in real time…",
                });
                if (now > lastTime + 0.001) {
                    lastTime = now;
                    movedAt = performance.now();
                }
                if (performance.now() - movedAt > 12000)
                    stopFailure = new Error("Audio playback stalled. Try a shorter clip or a lower resolution.");
                if (remaining <= 0.025 || this.audio.element.ended || stopFailure || this.cancelled) {
                    if (recorder.state === "recording") recorder.stop();
                }
            }, 20);
            await recorded;
            clearInterval(timer);
            this.audio.pause();
            this.check();
            if (stopFailure) throw stopFailure;
            const blob = new Blob(chunks, { type: mimeType });
            chunks.length = 0;
            if (!blob.size) throw new Error("No video frames were captured. Please try again.");
            stream.getTracks().forEach((track) => track.stop());
            this.renderer.exportFade = 1;
            this.renderer.resize(settings.width, settings.height);
            this.audio.setEnvelope(1, true);
            progress({ stage: "uploading", percent: 76, message: "Sending the recording to your local MP4 encoder…" });
            this.controller = new AbortController();
            const response = await fetch("/api/exports", {
                method: "POST",
                body: blob,
                signal: this.controller.signal,
                headers: {
                    "Content-Type": "video/webm",
                    "X-Video-Width": String(settings.width),
                    "X-Video-Height": String(settings.height),
                    "X-Video-Fps": String(settings.fps),
                    "X-Video-Duration": String(duration),
                    "X-Video-Quality": settings.quality,
                },
            });
            const job = await response.json();
            if (!response.ok) throw new Error(job.error || "The encoder rejected this recording.");
            this.job = job.id;
            this.check();
            for (;;) {
                await sleep(650);
                this.check();
                const poll = await fetch(`/api/jobs/${this.job}`, { signal: this.controller.signal });
                const status = await poll.json();
                if (!poll.ok || status.status === "error") throw new Error(status.error || "MP4 encoding failed.");
                if (status.status === "cancelled") throw new DOMException("Export cancelled.", "AbortError");
                progress({
                    stage: "encoding",
                    percent: 80 + (status.progress || 0) * 0.2,
                    message: "Encoding H.264 video + AAC audio…",
                });
                if (status.status === "done") break;
            }
            progress({ stage: "done", percent: 100, message: "Your video is ready for its next audience." });
            return `/api/jobs/${this.job}/download`;
        } finally {
            clearInterval(timer);
            if (visibility) document.removeEventListener("visibilitychange", visibility);
            if (this.recorder?.state === "recording") this.recorder.stop();
            stream?.getTracks().forEach((track) => track.stop());
            this.audio.pause();
            this.audio.setEnvelope(1, true);
            this.renderer.exportFade = 1;
            this.renderer.resize(settings.width, settings.height);
            await this.audio.seek(previousTime).catch(() => {});
        }
    }
}
