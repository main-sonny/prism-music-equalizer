import { createApp, ref, reactive, computed, watch, onMounted, nextTick } from "../vendor/vue.esm-browser.prod.js";
import { Icon } from "./icons.js";
import { AudioEngine } from "./audio.js";
import { VisualRenderer } from "./renderer.js";
import { VideoExporter, recordingSupport } from "./export.js";
import { decodeBackground } from "./background.js";
import {
    themes,
    platforms,
    defaultSettings,
    sanitizeSettings,
    formatTime,
    filename,
    download,
    blobToDataURL,
    imageData,
    readTags,
    storeProject,
    restoreProject,
} from "./state.js";

const Slider = {
    props: ["modelValue", "label", "min", "max", "step", "unit"],
    emits: ["update:modelValue"],
    template: `<label class="range-field"><span>{{ label }}<output>{{ Number(modelValue).toLocaleString(undefined, { maximumFractionDigits: 2 }) }}{{ unit || '' }}</output></span><input class="form-range" type="range" :aria-label="label" :min="min" :max="max" :step="step || 1" :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))"></label>`,
};

const Toggle = {
    props: ["modelValue", "label"],
    emits: ["update:modelValue"],
    template: `<label class="toggle-field"><span>{{ label }}</span><input class="form-check-input" type="checkbox" role="switch" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)"></label>`,
};

createApp({
    components: { Icon, Slider, Toggle },
    setup() {
        const settings = reactive(defaultSettings());
        const audio = new AudioEngine();
        let renderer;
        let exporter;
        let sourceBlob;
        let savingTimer;
        let historyTimer;
        let restoring = true;
        let history = [];
        let historyIndex = -1;
        const historyPosition = ref(-1);
        const historyLength = ref(0);
        const canvas = ref(null);
        const dialog = ref(null);
        const helpDialog = ref(null);
        const loaded = ref(false);
        const loading = ref(true);
        const playing = ref(false);
        const duration = ref(0);
        const currentTime = ref(0);
        const audioName = ref("midnight-demo.wav");
        const artwork = ref("");
        const backgroundImage = ref("");
        const peaks = ref([]);
        const tab = ref("visual");
        const toast = ref(null);
        const autoStatus = ref("Starting studio…");
        const encoder = ref(null);
        const exporting = ref(false);
        const exportState = reactive({ stage: "idle", percent: 0, message: "", elapsed: 0, duration: 0 });
        const resultUrl = ref("");
        const resultName = ref("");
        const exportError = ref("");
        const downloading = ref(false);
        const dragOver = ref(false);
        const canRecord = Boolean(recordingSupport());
        const clipDuration = computed(() => Math.max(0, settings.clipEnd - settings.clipStart));
        const selectedPlatform = computed(() => platforms.find((p) => p.id === settings.platform) || platforms[0]);
        const aspect = computed(() => `${settings.width} / ${settings.height}`);
        const progress = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0));
        const clipLeft = computed(() => (duration.value ? (settings.clipStart / duration.value) * 100 : 0));
        const clipRight = computed(() => (duration.value ? 100 - (settings.clipEnd / duration.value) * 100 : 0));
        const estimateMB = computed(() =>
            Math.round(
                ((Math.min(32000000, Math.max(2500000, settings.width * settings.height * settings.fps * 0.13)) / 8) *
                    clipDuration.value) /
                    1048576
            )
        );
        const locked = computed(() => exporting.value || loading.value);
        const visualizers = [
            { id: "halo", name: "Halo", icon: "circle" },
            { id: "bars", name: "Spectrum", icon: "bars" },
            { id: "wave", name: "Waveform", icon: "wave" },
            { id: "mirror", name: "Reflection", icon: "mirror" },
            { id: "orbit", name: "Orbit", icon: "orbit" },
            { id: "line", name: "Frequency", icon: "line" },
            { id: "ripple", name: "Ripple", icon: "circle" },
            { id: "flower", name: "Flower", icon: "sparkles" },
            { id: "spiral", name: "Spiral", icon: "orbit" },
            { id: "dots", name: "Dot matrix", icon: "grid" },
            { id: "mountain", name: "Mountain", icon: "wave" },
            { id: "tunnel", name: "Tunnel", icon: "layers" },
        ];
        let toastTimer;
        function notify(message, type = "info") {
            toast.value = { message, type };
            clearTimeout(toastTimer);
            toastTimer = setTimeout(
                () => {
                    toast.value = null;
                },
                type === "error" ? 10000 : 4500
            );
        }
        function choose(id) {
            if (!locked.value) document.getElementById(id).click();
        }
        function snapshot() {
            return JSON.stringify({
                settings: { ...settings },
                artwork: artwork.value,
                backgroundImage: backgroundImage.value,
            });
        }
        function commitHistory() {
            clearTimeout(historyTimer);
            const value = snapshot();
            if (history[historyIndex] === value) return;
            history = history.slice(0, historyIndex + 1);
            history.push(value);
            if (history.length > 40) history.shift();
            historyIndex = history.length - 1;
            historyPosition.value = historyIndex;
            historyLength.value = history.length;
        }
        function resetHistory() {
            history = [];
            historyIndex = -1;
            commitHistory();
        }
        async function undo(direction = -1) {
            if (locked.value) return;
            commitHistory();
            const index = historyIndex + direction;
            if (index < 0 || index >= history.length) return;
            restoring = true;
            const value = JSON.parse(history[index]);
            Object.assign(settings, value.settings);
            artwork.value = value.artwork;
            backgroundImage.value = value.backgroundImage;
            historyIndex = index;
            historyPosition.value = index;
            await nextTick();
            restoring = false;
            scheduleSave();
        }
        function projectData() {
            return {
                version: 1,
                settings: { ...settings },
                artwork: artwork.value,
                backgroundImage: backgroundImage.value,
                audioName: audioName.value,
                audio: sourceBlob,
            };
        }
        function scheduleSave() {
            if (restoring || !loaded.value) return;
            clearTimeout(savingTimer);
            autoStatus.value = "Unsaved changes";
            savingTimer = setTimeout(async () => {
                try {
                    await storeProject(projectData());
                    autoStatus.value = "Saved on this device";
                } catch {
                    autoStatus.value = "Autosave unavailable";
                }
            }, 1000);
        }
        watch(
            [settings, artwork, backgroundImage],
            () => {
                if (restoring) return;
                scheduleSave();
                clearTimeout(historyTimer);
                historyTimer = setTimeout(commitHistory, 350);
            },
            { deep: true }
        );
        watch(settings, () => audio.update(settings), { deep: true });
        watch([() => settings.width, () => settings.height], () => {
            if (
                renderer &&
                !exporting.value &&
                settings.width >= 240 &&
                settings.height >= 240 &&
                settings.width <= 3840 &&
                settings.height <= 3840
            )
                renderer.resize(settings.width, settings.height);
        });
        watch(artwork, (value) =>
            renderer?.setImage(value).catch(() => notify("Artwork could not be loaded.", "error"))
        );
        watch(backgroundImage, (value) =>
            renderer?.setImage(value, true).catch(() => notify("Background could not be loaded.", "error"))
        );
        function setTheme(theme) {
            Object.assign(settings, {
                theme: theme.id,
                primary: theme.primary,
                secondary: theme.secondary,
                background: theme.background,
                glow: theme.glow,
            });
        }
        function setPlatform(id) {
            const p = platforms.find((p) => p.id === id);
            if (!p) return;
            settings.platform = id;
            if (id !== "custom") {
                settings.width = p.width;
                settings.height = p.height;
            }
        }
        function normalizeSize() {
            for (const key of ["width", "height"])
                settings[key] = Math.max(240, Math.min(3840, Math.round((Number(settings[key]) || 1080) / 2) * 2));
        }
        function normalizeClip() {
            const max = duration.value;
            if (max < 0.25) return;
            settings.clipStart = Math.max(0, Math.min(max - 0.25, Number(settings.clipStart) || 0));
            settings.clipEnd = Math.max(settings.clipStart + 0.25, Math.min(max, Number(settings.clipEnd) || max));
        }
        function setTrim(boundary) {
            if (boundary === "start") settings.clipStart = currentTime.value;
            else settings.clipEnd = currentTime.value;
            normalizeClip();
        }
        function fullTrack() {
            settings.clipStart = 0;
            settings.clipEnd = duration.value;
        }
        async function seek(value) {
            if (locked.value || !loaded.value) return;
            try {
                await audio.seek(Number(value));
                currentTime.value = audio.element.currentTime;
            } catch (error) {
                notify(error.message, "error");
            }
        }
        async function togglePlay() {
            if (locked.value || !loaded.value) return;
            try {
                if (!audio.element.paused) audio.pause();
                else {
                    if (
                        audio.element.currentTime >= settings.clipEnd - 0.05 ||
                        audio.element.currentTime < settings.clipStart
                    )
                        await audio.seek(settings.clipStart);
                    audio.setEnvelope(1, true);
                    await audio.play(settings);
                }
            } catch (error) {
                notify(error.message, "error");
            }
        }
        async function updatePeaks(blob) {
            peaks.value = [];
            const next = await audio.createPeaks(blob);
            if (sourceBlob === blob) peaks.value = next;
        }
        async function loadAudio(file) {
            if (!file || locked.value) return;
            if (file.size > 200 * 1048576)
                return notify("Audio must be smaller than 200 MB. Trim very long files first.", "error");
            loading.value = true;
            const previousBlob = sourceBlob;
            const previousDuration = duration.value;
            const previousTime = audio.element.currentTime;
            try {
                const length = await audio.load(file);
                if (length < 0.25 || length > 7200) throw new Error("Choose audio between 0.25 seconds and 2 hours.");
                const tags = await readTags(file);
                let cover = "";
                if (tags.picture?.data?.length && tags.picture.data.length <= 30 * 1048576) {
                    try {
                        cover = await imageData(
                            new Blob([new Uint8Array(tags.picture.data)], { type: tags.picture.format || "image/jpeg" })
                        );
                    } catch {
                        notify("The embedded artwork is unsupported. You can upload a cover instead.");
                    }
                }
                sourceBlob = file;
                duration.value = length;
                audioName.value = file.name;
                settings.title = String(tags.title || file.name.replace(/\.[^.]+$/, "")).slice(0, 200);
                settings.artist = String(tags.artist || "Unknown artist").slice(0, 200);
                settings.projectName = settings.title;
                artwork.value = cover;
                settings.clipStart = 0;
                settings.clipEnd = length;
                loaded.value = true;
                updatePeaks(file);
                await nextTick();
                resetHistory();
                scheduleSave();
                notify(
                    tags.title || tags.artist
                        ? "Audio loaded. Embedded track details imported."
                        : "Audio loaded. Add your artist name and cover."
                );
            } catch (error) {
                if (previousBlob) {
                    try {
                        await audio.load(previousBlob);
                        await audio.seek(previousTime);
                        duration.value = previousDuration;
                    } catch {
                        loaded.value = false;
                    }
                } else loaded.value = false;
                notify(error.message, "error");
            } finally {
                loading.value = false;
            }
        }
        async function loadImage(file, isBackground = false) {
            if (!file || locked.value) return;
            try {
                if (file.size > 30 * 1024 * 1024) throw new Error("Image must be smaller than 30 MB.");
                const signature = new TextDecoder().decode(await file.slice(0, 6).arrayBuffer());
                const gif =
                    /\.gif$/i.test(file.name || "") || file.type === "image/gif" || /^GIF8[79]a$/.test(signature);
                if (gif && !/^GIF8[79]a$/.test(signature))
                    throw new Error("This .gif file is not valid GIF data. It will not be converted to a still image.");
                const data = gif ? await blobToDataURL(new Blob([file], { type: "image/gif" })) : await imageData(file);
                await decodeBackground(data);
                if (isBackground) {
                    backgroundImage.value = data;
                    settings.backgroundMode = gif ? "gif" : "photo";
                    settings.backgroundBlur = 0;
                } else artwork.value = data;
            } catch (error) {
                notify(`Image upload failed: ${error.message || "Unable to decode this image."}`, "error");
            }
        }
        function inputFile(event, type) {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (type === "audio") loadAudio(file);
            else if (type === "project") openProject(file);
            else loadImage(file, type === "background");
        }
        function dropAudio(event) {
            dragOver.value = false;
            loadAudio(event.dataTransfer.files?.[0]);
        }
        async function saveProject() {
            if (!loaded.value || locked.value) return;
            loading.value = true;
            try {
                const data = projectData();
                data.audioData = await blobToDataURL(sourceBlob);
                delete data.audio;
                download(
                    new Blob([JSON.stringify(data)], { type: "application/json" }),
                    `${filename(settings.projectName)}.prism`
                );
                notify("Project saved with its audio, artwork and settings.");
            } catch (error) {
                notify(error.message, "error");
            } finally {
                loading.value = false;
            }
        }
        function validImage(data) {
            return typeof data === "string" &&
                /^data:image\/(jpeg|png|webp|gif|bmp);base64,/i.test(data) &&
                data.length < 45 * 1048576
                ? data
                : "";
        }
        async function applyProject(data) {
            if (data.version !== 1 || !data.settings || !(data.audio instanceof Blob))
                throw new Error("This is not a supported Prism project.");
            const length = await audio.load(data.audio);
            if (length < 0.25 || length > 7200) throw new Error("The project audio duration is unsupported.");
            restoring = true;
            sourceBlob = data.audio;
            duration.value = length;
            audioName.value = String(data.audioName || "project-audio.mp3").slice(0, 200);
            Object.assign(settings, sanitizeSettings(data.settings));
            artwork.value = validImage(data.artwork);
            backgroundImage.value = validImage(data.backgroundImage);
            normalizeClip();
            loaded.value = true;
            await Promise.all([renderer.setImage(artwork.value), renderer.setImage(backgroundImage.value, true)]);
            renderer.resize(settings.width, settings.height);
            updatePeaks(sourceBlob);
            await nextTick();
            resetHistory();
            restoring = false;
            scheduleSave();
        }
        async function openProject(file) {
            if (!file || locked.value) return;
            if (file.size > 330 * 1048576)
                return notify("This project is larger than the 330 MB import limit.", "error");
            loading.value = true;
            const previous = loaded.value ? projectData() : null;
            try {
                const data = JSON.parse(await file.text());
                if (
                    data.version !== 1 ||
                    typeof data.audioData !== "string" ||
                    !/^data:[^,]*;base64,/.test(data.audioData)
                )
                    throw new Error("Choose a .prism project exported by this studio.");
                data.audio = await fetch(data.audioData).then((r) => r.blob());
                if (data.audio.size > 200 * 1048576) throw new Error("Project audio exceeds 200 MB.");
                await applyProject(data);
                notify("Project restored, including audio and artwork.");
            } catch (error) {
                if (previous)
                    await applyProject(previous).catch(() => {
                        loaded.value = false;
                    });
                notify(error.message || "Unable to open project.", "error");
            } finally {
                loading.value = false;
                restoring = false;
            }
        }
        async function checkEncoder() {
            try {
                const response = await fetch("/api/health");
                if (!response.ok) throw new Error();
                encoder.value = (await response.json()).ffmpeg;
            } catch {
                encoder.value = null;
            }
        }
        function openExport() {
            if (locked.value || !loaded.value) return;
            audio.pause();
            normalizeClip();
            normalizeSize();
            checkEncoder();
            if (exportState.stage !== "done") exportState.stage = "idle";
            exportError.value = "";
            dialog.value.showModal();
        }
        function closeExport() {
            if (!exporting.value) dialog.value.close();
        }
        async function startExport() {
            if (exporting.value) return;
            normalizeClip();
            normalizeSize();
            if (clipDuration.value < 0.25) return;
            exportError.value = "";
            resultUrl.value = "";
            exporting.value = true;
            exporter = new VideoExporter(audio, renderer);
            try {
                const frozen = { ...sanitizeSettings(settings) };
                resultName.value = `${filename(settings.title)}-${selectedPlatform.value.id}.mp4`;
                resultUrl.value = await exporter.run(frozen, (value) => Object.assign(exportState, value));
                notify("Your MP4 is ready. Choose Download MP4 to save it.");
            } catch (error) {
                exportState.stage = "idle";
                if (error.name === "AbortError") notify("Export cancelled. Your project is unchanged.");
                else exportError.value = error.message || "Export failed. Please try again.";
            } finally {
                exporting.value = false;
            }
        }
        async function cancelExport() {
            await exporter?.cancel();
        }
        async function saveVideo() {
            if (!resultUrl.value || downloading.value) return;
            downloading.value = true;
            let handle;
            try {
                if ("showSaveFilePicker" in window) {
                    try {
                        handle = await window.showSaveFilePicker({
                            suggestedName: resultName.value,
                            types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
                        });
                    } catch (error) {
                        if (error.name === "AbortError") return;
                    }
                }
                const response = await fetch(resultUrl.value);
                if (!response.ok) throw new Error("This export is no longer available. Record a fresh export.");
                if (handle) {
                    const writable = await handle.createWritable();
                    await response.body.pipeTo(writable);
                } else download(await response.blob(), resultName.value);
                notify("MP4 saved. Ready to upload to your platform.");
            } catch (error) {
                notify(error.message, "error");
            } finally {
                downloading.value = false;
            }
        }
        function screenshot() {
            if (locked.value) return;
            renderer.resize(settings.width, settings.height, true);
            renderer.draw();
            canvas.value.toBlob((blob) => {
                if (blob) download(blob, `${filename(settings.title)}-cover.png`);
            }, "image/png");
            renderer.resize(settings.width, settings.height);
        }
        async function fullscreen() {
            try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.getElementById("preview-frame").requestFullscreen();
            } catch {
                notify("Fullscreen is not supported in this browser.");
            }
        }
        function resetVisuals() {
            if (!confirm("Reset visual styling? Your audio, titles, clip and output settings will stay.")) return;
            const defaults = defaultSettings();
            const keys = [
                "artworkBass",
                "artworkBassAmount",
                "flashMode",
                "beatSensitivity",
                "customFont",
                "videoFadeIn",
                "videoFadeOut",
                "flashEnabled",
                "flashRate",
                "flashAmount",
                "flashColor",
                "backgroundDim",
                "showVisualizer",
                "showBackground",
                "showAmbientGlow",
                "bassPulse",
                "bassPulseAmount",
                "bassGlow",
                "bassGlowAmount",
                "bassCamera",
                "bassCameraAmount",
                "showArtwork",
                "showTitle",
                "showArtist",
                "showChannel",
                "showProgress",
                "watermark",
                "theme",
                "primary",
                "secondary",
                "background",
                "glow",
                "visualizer",
                "layout",
                "barCount",
                "sensitivity",
                "smoothing",
                "visualSize",
                "lineWidth",
                "rotation",
                "mirror",
                "glowAmount",
                "particles",
                "particleCount",
                "grid",
                "vignette",
                "backgroundMode",
                "backgroundBlur",
                "font",
                "textScale",
                "textColor",
                "artworkShape",
                "artworkSize",
                "artworkSpin",
            ];
            for (const key of keys) settings[key] = defaults[key];
        }
        onMounted(async () => {
            renderer = new VisualRenderer(canvas.value, audio, () => settings);
            renderer.resize(settings.width, settings.height);
            audio.element.addEventListener("play", () => {
                playing.value = true;
            });
            audio.element.addEventListener("pause", () => {
                playing.value = false;
            });
            const updateClock = () => {
                currentTime.value = audio.element.currentTime || 0;
                if (!exporting.value && playing.value && currentTime.value >= settings.clipEnd - 0.02) {
                    audio.pause();
                    if (settings.loop)
                        audio
                            .seek(settings.clipStart)
                            .then(() => audio.play(settings))
                            .catch((error) => notify(error.message, "error"));
                }
                requestAnimationFrame(updateClock);
            };
            updateClock();
            checkEncoder();
            try {
                const saved = await restoreProject().catch(() => null);
                if (saved) {
                    try {
                        await applyProject(saved);
                        notify("Welcome back. Your last session is restored.");
                    } catch {
                        loaded.value = false;
                    }
                }
                if (!loaded.value) {
                    const [blob, cover] = await Promise.all([
                        fetch("/assets/midnight-demo.wav").then((r) => {
                            if (!r.ok) throw new Error("Demo audio missing. Upload an audio file to begin.");
                            return r.blob();
                        }),
                        fetch("/assets/midnight-cover.jpg")
                            .then((r) => r.blob())
                            .then(blobToDataURL),
                    ]);
                    await applyProject({
                        version: 1,
                        settings: defaultSettings(),
                        artwork: cover,
                        audioName: "midnight-demo.wav",
                        audio: blob,
                    });
                }
            } catch (error) {
                autoStatus.value = "Upload audio to begin";
                notify(error.message, "error");
            } finally {
                loading.value = false;
                restoring = false;
            }
            document.addEventListener("keydown", (event) => {
                if (
                    ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(event.target.tagName) ||
                    event.target.isContentEditable ||
                    dialog.value.open ||
                    helpDialog.value.open ||
                    locked.value
                )
                    return;
                if (event.code === "Space") {
                    event.preventDefault();
                    togglePlay();
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                    event.preventDefault();
                    undo(event.shiftKey ? 1 : -1);
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                    event.preventDefault();
                    saveProject();
                }
                if (event.code === "ArrowLeft") {
                    event.preventDefault();
                    seek(currentTime.value - 5);
                }
                if (event.code === "ArrowRight") {
                    event.preventDefault();
                    seek(currentTime.value + 5);
                }
            });
            window.addEventListener("beforeunload", (event) => {
                if (exporting.value || autoStatus.value === "Unsaved changes") {
                    event.preventDefault();
                    event.returnValue = "";
                }
            });
        });
        return {
            settings,
            themes,
            platforms,
            visualizers,
            canvas,
            dialog,
            helpDialog,
            loaded,
            loading,
            playing,
            duration,
            currentTime,
            audioName,
            artwork,
            backgroundImage,
            peaks,
            tab,
            toast,
            autoStatus,
            encoder,
            exporting,
            exportState,
            resultUrl,
            resultName,
            exportError,
            downloading,
            dragOver,
            canRecord,
            clipDuration,
            selectedPlatform,
            aspect,
            progress,
            clipLeft,
            clipRight,
            estimateMB,
            locked,
            historyPosition,
            historyLength,
            formatTime,
            notify,
            choose,
            undo,
            setTheme,
            setPlatform,
            normalizeSize,
            normalizeClip,
            setTrim,
            fullTrack,
            seek,
            togglePlay,
            inputFile,
            dropAudio,
            saveProject,
            openExport,
            closeExport,
            startExport,
            cancelExport,
            saveVideo,
            screenshot,
            fullscreen,
            resetVisuals,
            checkEncoder,
        };
    },
}).mount("#app");
