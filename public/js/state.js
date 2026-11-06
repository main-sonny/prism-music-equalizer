export const themes = [
    {
        id: "prism",
        name: "Ultraviolet",
        tag: "SIGNATURE",
        primary: "#a78bfa",
        secondary: "#e879f9",
        background: "#100d26",
        glow: "#6139bd",
    },
    {
        id: "mint",
        name: "Afterhours",
        tag: "ELECTRIC",
        primary: "#5eead4",
        secondary: "#38bdf8",
        background: "#071a20",
        glow: "#106b6a",
    },
    {
        id: "sunset",
        name: "Golden hour",
        tag: "WARM",
        primary: "#ffb56b",
        secondary: "#fb7185",
        background: "#23101c",
        glow: "#9c3d39",
    },
    {
        id: "rose",
        name: "Pink noise",
        tag: "VIBRANT",
        primary: "#f472b6",
        secondary: "#c084fc",
        background: "#200e26",
        glow: "#992761",
    },
    {
        id: "ice",
        name: "Deep blue",
        tag: "COOL",
        primary: "#7dd3fc",
        secondary: "#818cf8",
        background: "#0a132a",
        glow: "#214c96",
    },
    {
        id: "mono",
        name: "Monochrome",
        tag: "MINIMAL",
        primary: "#f1f5f9",
        secondary: "#94a3b8",
        background: "#12151a",
        glow: "#39414c",
    },
];

export const platforms = [
    {
        id: "youtube",
        name: "YouTube",
        note: "Landscape video",
        ratio: "16:9",
        width: 1920,
        height: 1080,
        icon: "youtube",
        color: "#fb7185",
    },
    {
        id: "shorts",
        name: "YouTube Shorts",
        note: "Vertical video",
        ratio: "9:16",
        width: 1080,
        height: 1920,
        icon: "shorts",
        color: "#fb7185",
    },
    {
        id: "tiktok",
        name: "TikTok",
        note: "For You feed",
        ratio: "9:16",
        width: 1080,
        height: 1920,
        icon: "music",
        color: "#5eead4",
    },
    {
        id: "reels",
        name: "Instagram Reels",
        note: "Vertical reel",
        ratio: "9:16",
        width: 1080,
        height: 1920,
        icon: "instagram",
        color: "#e879f9",
    },
    {
        id: "square",
        name: "Instagram Post",
        note: "Square video",
        ratio: "1:1",
        width: 1080,
        height: 1080,
        icon: "instagram",
        color: "#e879f9",
    },
    {
        id: "portrait",
        name: "Portrait feed",
        note: "Instagram / Facebook",
        ratio: "4:5",
        width: 1080,
        height: 1350,
        icon: "layout",
        color: "#93c5fd",
    },
    {
        id: "vimeo",
        name: "Vimeo / Facebook",
        note: "Landscape video",
        ratio: "16:9",
        width: 1920,
        height: 1080,
        icon: "video",
        color: "#7dd3fc",
    },
    {
        id: "custom",
        name: "Custom",
        note: "Your own dimensions",
        ratio: "Custom",
        width: 1920,
        height: 1080,
        icon: "sliders",
        color: "#c4b5fd",
    },
];

export function defaultSettings() {
    return {
        title: "Midnight Current",
        artist: "Nova Drift",
        channel: "@main-sonny",
        projectName: "Midnight session",
        theme: "prism",
        primary: "#a78bfa",
        secondary: "#e879f9",
        background: "#100d26",
        glow: "#6139bd",
        visualizer: "halo",
        layout: "center",
        barCount: 96,
        sensitivity: 1.25,
        smoothing: 0.78,
        visualSize: 1,
        lineWidth: 3,
        rotation: 0,
        mirror: true,
        glowAmount: 0.65,
        showVisualizer: true,
        showBackground: true,
        showAmbientGlow: true,
        bassPulse: false,
        bassPulseAmount: 0.5,
        bassGlow: false,
        bassGlowAmount: 0.5,
        bassCamera: false,
        bassCameraAmount: 0.3,
        particles: true,
        particleCount: 42,
        grid: false,
        vignette: true,
        backgroundMode: "gradient",
        backgroundBlur: 20,
        showTitle: true,
        showArtist: true,
        showChannel: true,
        showArtwork: true,
        showProgress: true,
        watermark: false,
        watermarkText: "PRISM",
        font: "sans-serif",
        customFont: "Arial",
        textScale: 1,
        textColor: "#ffffff",
        artworkShape: "circle",
        artworkSize: 1,
        artworkSpin: false,
        artworkBass: false,
        artworkBassAmount: 0.6,
        bass: 0,
        mid: 0,
        treble: 0,
        videoFadeIn: 0.6,
        videoFadeOut: 1.2,
        flashEnabled: false,
        flashMode: "bass",
        beatSensitivity: 1,
        flashRate: 1,
        flashAmount: 0.15,
        flashColor: "#ffffff",
        backgroundDim: 0.35,
        volume: 0.8,
        fadeIn: 0.6,
        fadeOut: 1.2,
        clipStart: 0,
        clipEnd: 24,
        loop: false,
        platform: "youtube",
        width: 1920,
        height: 1080,
        fps: 30,
        quality: "balanced",
        safeGuides: false,
    };
}

export function sanitizeSettings(input) {
    const clean = defaultSettings();
    if (!input || typeof input !== "object") return clean;
    for (const key of Object.keys(clean)) {
        if (typeof input[key] === typeof clean[key]) {
            if (typeof clean[key] === "number" && !Number.isFinite(input[key])) continue;
            clean[key] = typeof input[key] === "string" ? input[key].slice(0, 200) : input[key];
        }
    }
    if (input.videoFadeIn === undefined) clean.videoFadeIn = clean.fadeIn;
    if (input.videoFadeOut === undefined) clean.videoFadeOut = clean.fadeOut;
    const bounds = {
        beatSensitivity: [0.5, 3],
        artworkBassAmount: [0, 1],
        videoFadeIn: [0, 5],
        videoFadeOut: [0, 5],
        flashRate: [0.2, 2],
        flashAmount: [0, 0.5],
        backgroundDim: [0, 1],
        bassPulseAmount: [0, 1],
        bassGlowAmount: [0, 1],
        bassCameraAmount: [0, 1],
        barCount: [16, 192],
        sensitivity: [0.2, 3],
        smoothing: [0, 0.95],
        visualSize: [0.5, 1.5],
        lineWidth: [1, 8],
        rotation: [0, 360],
        glowAmount: [0, 1],
        particleCount: [0, 100],
        backgroundBlur: [0, 50],
        textScale: [0.6, 1.6],
        artworkSize: [0.5, 1.4],
        bass: [-12, 12],
        mid: [-12, 12],
        treble: [-12, 12],
        volume: [0, 1],
        fadeIn: [0, 5],
        fadeOut: [0, 5],
        clipStart: [0, 7200],
        clipEnd: [0, 7200],
        width: [240, 3840],
        height: [240, 3840],
    };
    for (const [key, [min, max]] of Object.entries(bounds)) clean[key] = Math.max(min, Math.min(max, clean[key]));
    for (const key of ["primary", "secondary", "background", "glow", "textColor", "flashColor"])
        if (!/^#[0-9a-f]{6}$/i.test(clean[key])) clean[key] = defaultSettings()[key];
    clean.width = Math.round(clean.width / 2) * 2;
    clean.height = Math.round(clean.height / 2) * 2;
    if (![24, 30, 60, 90, 120].includes(clean.fps)) clean.fps = 30;
    if (
        ![
            "halo",
            "bars",
            "wave",
            "mirror",
            "orbit",
            "line",
            "ripple",
            "flower",
            "spiral",
            "dots",
            "mountain",
            "tunnel",
        ].includes(clean.visualizer)
    )
        clean.visualizer = "halo";
    if (!["bass", "timer"].includes(clean.flashMode)) clean.flashMode = "bass";
    clean.customFont = String(clean.customFont || "Arial").slice(0, 100);
    if (!["gradient", "solid", "artwork", "photo", "gif"].includes(clean.backgroundMode))
        clean.backgroundMode = "gradient";
    return clean;
}

export function formatTime(seconds, precise = false) {
    if (!Number.isFinite(seconds)) return "0:00";
    const m = Math.floor(Math.max(0, seconds) / 60);
    const s = Math.floor(Math.max(0, seconds) % 60)
        .toString()
        .padStart(2, "0");
    return `${m}:${s}${precise ? "." + Math.floor((seconds % 1) * 10) : ""}`;
}

export function filename(value) {
    return (
        (value || "prism-video")
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
            .replace(/\.+$/g, "")
            .slice(0, 100) || "prism-video"
    );
}

export function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export async function imageData(file) {
    if (!file.type.startsWith("image/")) throw new Error("Choose a JPG, PNG, WebP or other supported image.");
    if (file.size > 30 * 1024 * 1024) throw new Error("Artwork must be smaller than 30 MB.");
    const image = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    return canvas.toDataURL("image/jpeg", 0.9);
}

export function readTags(file) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve({}), 8000);
        window.jsmediatags.read(file, {
            onSuccess: (result) => {
                clearTimeout(timeout);
                resolve(result.tags || {});
            },
            onError: () => {
                clearTimeout(timeout);
                resolve({});
            },
        });
    });
}

let dbPromise;
function database() {
    if (!dbPromise)
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open("prism-studio", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("projects");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    return dbPromise;
}

export async function storeProject(data) {
    const db = await database();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("projects", "readwrite");
        transaction.objectStore("projects").put(data, "autosave");
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

export async function restoreProject() {
    const db = await database();
    return new Promise((resolve, reject) => {
        const request = db.transaction("projects").objectStore("projects").get("autosave");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
