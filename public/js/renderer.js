import { BassBeat } from "./beat.js";
import { decodeBackground } from "./background.js";
import { formatTime } from "./state.js";

function roundRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
}

function cover(ctx, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

export class VisualRenderer {
    constructor(canvas, audio, getSettings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d", { alpha: false });
        this.audio = audio;
        this.getSettings = getSettings;
        this.beat = new BassBeat();
        this.art = null;
        this.backgroundImage = null;
        this.exporting = false;
        this.exportFade = 1;
        this.running = true;
        this.particles = Array.from({ length: 100 }, (_, i) => ({
            x: (((Math.sin(i * 127.1 + 31) * 43758.5453) % 1) + 1) % 1,
            y: (((Math.cos(i * 311.7 + 13) * 28463.3419) % 1) + 1) % 1,
            r: 0.7 + (i % 4) * 0.55,
            speed: 0.008 + (i % 7) * 0.002,
        }));
        this.tick = () => {
            if (!this.running) return;
            this.draw();
            this.frame = requestAnimationFrame(this.tick);
        };
        this.tick();
    }

    async setImage(url, background = false) {
        const key = background ? "backgroundImage" : "art";
        const token = Symbol();
        this[key + "Token"] = token;
        if (!url) {
            this[key] = null;
            return;
        }
        const image = await decodeBackground(url);
        if (this[key + "Token"] === token) this[key] = image;
    }

    resize(width, height, exporting = false) {
        this.exporting = exporting;
        const factor = exporting ? 1 : Math.min(1, 1440 / Math.max(width, height));
        this.canvas.width = Math.round(width * factor);
        this.canvas.height = Math.round(height * factor);
        this.draw();
    }

    draw() {
        const c = this.ctx;
        const s = this.getSettings();
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (!w || !h) return;
        const u = Math.min(w, h) / 1080;
        const portrait = h > w * 1.1;
        const split = s.layout === "split" && !portrait;
        const minimal = s.layout === "minimal";
        const time = this.audio.element.currentTime || 0;
        const now = performance.now() / 1000;
        const paused = this.audio.element.paused && !this.exporting;
        if (!paused || this.previewTrackTime !== time || this.previewPaused !== paused) this.previewAnchor = now;
        this.previewTrackTime = time;
        this.previewPaused = paused;
        this.previewAnchor ??= now;
        const effectTime = Math.max(0, time - Number(s.clipStart)) + (paused ? now - this.previewAnchor : 0);
        const ambientTime = this.exporting || !paused ? time : effectTime;
        const { frequency, wave, beatFrequency = frequency, bassLevel } = this.audio.sample();
        const hzPerBin = (this.audio.context?.sampleRate || 48000) / (frequency.length * 2);
        const lowBin = Math.max(1, Math.ceil(30 / hzPerBin));
        const highBin = Math.min(frequency.length - 1, Math.ceil(180 / hzPerBin));
        let bass = 0;
        for (let i = lowBin; i <= highBin; i++) bass += frequency[i];
        bass = Math.min(1, (bass / ((highBin - lowBin + 1) * 255)) * Number(s.sensitivity));
        let beatLevel = 0;
        for (let i = lowBin; i <= highBin; i++) beatLevel += beatFrequency[i];
        beatLevel /= (highBin - lowBin + 1) * 255;
        if (paused) this.beat.reset();
        const beatPulse = paused
            ? 0
            : this.beat.update(
                  Number.isFinite(bassLevel) ? bassLevel : beatLevel,
                  time,
                  Number(s.beatSensitivity) || 1
              );
        const pulse = 1 + (s.bassPulse ? beatPulse * Number(s.bassPulseAmount) * 0.22 : 0);
        const glowBoost = s.bassGlow ? bass * Number(s.bassGlowAmount) : 0;
        const camera = s.bassCamera ? bass * Number(s.bassCameraAmount) : 0;
        const isRadial = ["halo", "orbit", "ripple", "flower", "spiral", "tunnel"].includes(s.visualizer);
        const cx = split ? w * 0.29 : w / 2;
        const cy = portrait ? h * 0.4 : h * 0.43;
        const radius = (portrait ? 224 : 170) * u * Number(s.visualSize);
        c.globalAlpha = 1;
        c.shadowBlur = 0;
        c.fillStyle = s.showBackground ? s.background : "#000000";
        c.fillRect(0, 0, w, h);
        c.save();
        c.translate(
            w / 2 + Math.sin(ambientTime * 2.3) * camera * w * 0.012,
            h / 2 + Math.cos(ambientTime * 1.7) * camera * h * 0.012
        );
        c.scale(1 + camera * 0.08, 1 + camera * 0.08);
        c.translate(-w / 2, -h / 2);
        const frameAt = (image) =>
            image?.frames
                ? image.frames.find((frame) => effectTime % image.duration < frame.end)?.image || image.frames[0].image
                : image;
        const art = frameAt(this.art);
        const background = s.backgroundMode === "artwork" ? art : frameAt(this.backgroundImage);
        if (s.showBackground && ["artwork", "photo", "gif"].includes(s.backgroundMode) && (background || art)) {
            c.save();
            c.filter = `blur(${Number(s.backgroundBlur) * u}px)`;
            cover(c, background || art, -60 * u, -60 * u, w + 120 * u, h + 120 * u);
            c.restore();
            c.fillStyle = `rgba(5,7,18,${s.backgroundDim})`;
            c.fillRect(0, 0, w, h);
        }
        if (s.showAmbientGlow && (s.backgroundMode !== "solid" || s.bassGlow)) {
            c.save();
            c.globalAlpha = 1;
            const glow = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.65);
            const alpha = Math.round(101 + glowBoost * 110)
                .toString(16)
                .padStart(2, "0");
            glow.addColorStop(0, s.glow + alpha);
            glow.addColorStop(0.5, s.glow + "25");
            glow.addColorStop(1, s.background + "00");
            c.fillStyle = glow;
            c.fillRect(0, 0, w, h);
            const wash = c.createLinearGradient(0, 0, w, h);
            wash.addColorStop(0, s.secondary + "0e");
            wash.addColorStop(0.5, "#00000000");
            wash.addColorStop(1, s.primary + "16");
            c.fillStyle = wash;
            c.fillRect(0, 0, w, h);
            c.restore();
        }
        if (s.grid) {
            c.strokeStyle = s.primary + "12";
            c.lineWidth = u;
            c.beginPath();
            for (let x = 0; x < w; x += 60 * u) {
                c.moveTo(x, 0);
                c.lineTo(x, h);
            }
            for (let y = 0; y < h; y += 60 * u) {
                c.moveTo(0, y);
                c.lineTo(w, y);
            }
            c.stroke();
        }
        if (s.particles) {
            for (const p of this.particles.slice(0, s.particleCount)) {
                const x = (p.x + Math.sin(ambientTime * 0.13 + p.y * 6) * 0.012) * w;
                const y = ((p.y - ambientTime * p.speed * 0.08 + 100) % 1) * h;
                c.globalAlpha = 0.14 + p.r * 0.1 + bass * 0.12;
                c.fillStyle = s.primary;
                c.beginPath();
                c.arc(x, y, p.r * u, 0, Math.PI * 2);
                c.fill();
            }
            c.globalAlpha = 1;
        }
        const gradient = c.createLinearGradient(cx - radius * 2, cy - radius, cx + radius * 2, cy + radius);
        gradient.addColorStop(0, s.primary);
        gradient.addColorStop(1, s.secondary);
        const count = Math.round(Number(s.barCount));
        const strength = (index) => {
            const normalized = s.mirror ? Math.abs((index / count) * 2 - 1) : index / count;
            const bin = Math.min(850, Math.floor(2 + Math.pow(normalized, 1.8) * 480));
            return Math.min(1, (frequency[bin] / 255) * Number(s.sensitivity));
        };
        const vizWidth = split ? w * 0.36 : w * (portrait ? 0.78 : 0.65);
        const vizX = isRadial ? cx : split ? w * 0.7 : cx;
        const vizY = isRadial ? cy : minimal || !s.showArtwork ? h * 0.43 : portrait ? h * 0.58 : h * 0.64;
        c.save();
        if (s.showVisualizer) {
            c.translate(vizX, vizY);
            c.scale(pulse, pulse);
            c.translate(-vizX, -vizY);
            c.strokeStyle = gradient;
            c.fillStyle = gradient;
            c.lineWidth = Number(s.lineWidth) * u;
            c.lineCap = "round";
            c.shadowColor = s.primary;
            c.shadowBlur = (Number(s.glowAmount) * 28 + glowBoost * 60) * u;
            if (s.visualizer === "halo" || s.visualizer === "orbit") {
                const inner = radius * 1.24;
                c.save();
                c.translate(cx, cy);
                c.rotate((Number(s.rotation) * Math.PI) / 180);
                for (let i = 0; i < count; i++) {
                    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
                    const value = strength(i);
                    const length = (5 + value * 112) * u;
                    c.globalAlpha = 0.45 + value * 0.55;
                    c.beginPath();
                    c.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
                    c.lineTo(Math.cos(angle) * (inner + length), Math.sin(angle) * (inner + length));
                    c.stroke();
                }
                c.globalAlpha = 0.23;
                c.lineWidth = 1.2 * u;
                c.beginPath();
                c.arc(0, 0, inner - 10 * u, 0, Math.PI * 2);
                c.stroke();
                c.globalAlpha = 0.07;
                c.beginPath();
                c.arc(0, 0, inner + 126 * u, 0, Math.PI * 2);
                c.stroke();
                if (s.visualizer === "orbit") {
                    for (let i = 0; i < 3; i++) {
                        c.globalAlpha = 0.5;
                        c.rotate(ambientTime * 0.07 + i * 0.7);
                        c.beginPath();
                        c.ellipse(0, 0, inner + (50 + i * 20) * u, inner * 0.48, 0.4, 0, Math.PI * 2);
                        c.stroke();
                    }
                }
                c.restore();
            }
            if (["bars", "mirror", "wave", "line"].includes(s.visualizer)) {
                if (s.visualizer === "wave" || s.visualizer === "line") {
                    c.beginPath();
                    const points = 240;
                    for (let i = 0; i <= points; i++) {
                        const x = vizX - vizWidth / 2 + (i / points) * vizWidth;
                        const value =
                            s.visualizer === "wave"
                                ? (wave[Math.floor((i / points) * 2047)] - 128) / 128
                                : frequency[Math.floor((i / points) * 450)] / 255;
                        const y = vizY - value * 100 * u * s.sensitivity;
                        if (i === 0) c.moveTo(x, y);
                        else c.lineTo(x, y);
                    }
                    c.stroke();
                } else {
                    const step = vizWidth / count;
                    const barWidth = Math.max(u, step * 0.55);
                    for (let i = 0; i < count; i++) {
                        const value = strength(i);
                        const barHeight = (4 + value * 150 * s.visualSize) * u;
                        const x = vizX - vizWidth / 2 + i * step;
                        roundRect(c, x, vizY - barHeight, barWidth, barHeight, Math.min(barWidth / 2, 4 * u));
                        c.fill();
                        if (s.visualizer === "mirror") {
                            c.globalAlpha = 0.3;
                            roundRect(c, x, vizY + 8 * u, barWidth, barHeight * 0.65, Math.min(barWidth / 2, 4 * u));
                            c.fill();
                            c.globalAlpha = 1;
                        }
                    }
                }
            }
            if (["ripple", "flower", "spiral", "tunnel"].includes(s.visualizer)) {
                c.save();
                c.translate(cx, cy);
                c.rotate((Number(s.rotation) * Math.PI) / 180);
                if (s.visualizer === "ripple" || s.visualizer === "flower") {
                    const rings = s.visualizer === "ripple" ? 5 : 3;
                    for (let ring = 0; ring < rings; ring++) {
                        c.globalAlpha = 0.8 - ring * 0.12;
                        c.beginPath();
                        for (let i = 0; i <= count; i++) {
                            const angle = (i / count) * Math.PI * 2;
                            const value = strength(i % count);
                            const petals =
                                s.visualizer === "flower"
                                    ? Math.cos(angle * 6 + ambientTime * 0.6) * (12 + value * 38) * u
                                    : Math.sin(angle * 3 + ambientTime * 2 - ring) * value * 18 * u;
                            const r = radius * (1.2 + ring * 0.16) + value * (35 + ring * 5) * u + petals;
                            const x = Math.cos(angle) * r;
                            const y = Math.sin(angle) * r;
                            if (!i) c.moveTo(x, y);
                            else c.lineTo(x, y);
                        }
                        c.closePath();
                        c.stroke();
                    }
                } else if (s.visualizer === "spiral") {
                    for (let arm = 0; arm < 3; arm++) {
                        c.globalAlpha = 0.85 - arm * 0.15;
                        c.beginPath();
                        for (let i = 0; i <= count * 2; i++) {
                            const t = i / (count * 2);
                            const angle = t * Math.PI * 3 + (arm * Math.PI * 2) / 3 + ambientTime * 0.35;
                            const r = radius * (1.05 + t * 0.9) + strength(i % count) * 45 * u;
                            const x = Math.cos(angle) * r;
                            const y = Math.sin(angle) * r;
                            if (!i) c.moveTo(x, y);
                            else c.lineTo(x, y);
                        }
                        c.stroke();
                    }
                } else {
                    c.rotate(Math.sin(ambientTime * 0.25) * 0.12);
                    for (let ring = 0; ring < 7; ring++) {
                        const phase = (((ambientTime * 0.16 + ring / 7) % 1) + 1) % 1;
                        const r = radius * (1.1 + phase * 1.25) + strength((ring / 7) * count) * 24 * u;
                        c.globalAlpha = (1 - phase) * 0.7;
                        roundRect(c, -r, -r, r * 2, r * 2, r * 0.18);
                        c.stroke();
                    }
                }
                c.restore();
            }
            if (s.visualizer === "dots") {
                const columns = Math.min(count, 96);
                const step = vizWidth / columns;
                const dotRadius = Math.max(u, Math.min(step * 0.28, 4 * u));
                for (let i = 0; i < columns; i++) {
                    const rows = 1 + Math.round(strength((i / columns) * count) * 13);
                    for (let row = 0; row < rows; row++) {
                        c.globalAlpha = 0.35 + (row / 14) * 0.65;
                        c.beginPath();
                        c.arc(
                            vizX - vizWidth / 2 + (i + 0.5) * step,
                            vizY - row * 11 * u * s.visualSize,
                            dotRadius,
                            0,
                            Math.PI * 2
                        );
                        c.fill();
                    }
                }
            }
            if (s.visualizer === "mountain") {
                for (let layer = 2; layer >= 0; layer--) {
                    c.beginPath();
                    c.moveTo(vizX - vizWidth / 2, vizY + layer * 16 * u);
                    for (let i = 0; i <= count; i++) {
                        const value = strength((i + layer * 11) % count);
                        const x = vizX - vizWidth / 2 + (i / count) * vizWidth;
                        const y = vizY + layer * 16 * u - (8 + value * (150 - layer * 28)) * u * s.visualSize;
                        c.lineTo(x, y);
                    }
                    c.lineTo(vizX + vizWidth / 2, vizY + layer * 16 * u);
                    c.closePath();
                    c.globalAlpha = 0.12 + (2 - layer) * 0.06;
                    c.fill();
                    c.globalAlpha = 0.75 - layer * 0.2;
                    c.stroke();
                }
            }
        }
        c.restore();
        if (s.showArtwork && !minimal) {
            const artRadius = radius * Number(s.artworkSize) * (isRadial ? 0.94 : 0.83);
            const artY = !isRadial && !split ? (portrait ? h * 0.32 : h * 0.33) : cy;
            c.save();
            c.translate(cx, artY);
            const artworkPulse =
                1 +
                Math.max(
                    s.bassPulse ? beatPulse * Number(s.bassPulseAmount) * 0.22 : 0,
                    s.artworkBass ? beatPulse * Number(s.artworkBassAmount) * 0.3 : 0
                );
            c.scale(artworkPulse, artworkPulse);
            if (s.artworkSpin) c.rotate(ambientTime * 0.12);
            c.shadowColor = glowBoost > 0 ? s.primary : "#000000";
            c.shadowBlur = (60 + glowBoost * 50) * u;
            if (s.artworkShape === "circle") {
                c.beginPath();
                c.arc(0, 0, artRadius, 0, Math.PI * 2);
            } else roundRect(c, -artRadius, -artRadius, artRadius * 2, artRadius * 2, 24 * u);
            c.fillStyle = s.glow;
            c.fill();
            c.shadowBlur = 0;
            c.clip();
            if (art) cover(c, art, -artRadius, -artRadius, artRadius * 2, artRadius * 2);
            else {
                c.fillStyle = gradient;
                c.fillRect(-artRadius, -artRadius, artRadius * 2, artRadius * 2);
                c.fillStyle = "#ffffff";
                c.font = `${artRadius}px sans-serif`;
                c.textAlign = "center";
                c.textBaseline = "middle";
                c.fillText("♫", 0, 0);
            }
            c.restore();
        }
        c.restore();
        const textX = split ? w * 0.69 : w / 2;
        const textY = split ? h * 0.4 : portrait ? h * 0.7 : h * 0.77;
        const maxWidth = split ? w * 0.45 : w * 0.82;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = s.textColor;
        const fonts = {
            "sans-serif": "Arial, sans-serif",
            serif: "Georgia, serif",
            monospace: '"Courier New", monospace',
            impact: "Impact, sans-serif",
            verdana: "Verdana, sans-serif",
            tahoma: "Tahoma, sans-serif",
            trebuchet: '"Trebuchet MS", sans-serif',
            times: '"Times New Roman", serif',
            palatino: '"Palatino Linotype", serif',
            georgia: "Georgia, serif",
            segoe: '"Segoe UI", sans-serif',
            comic: '"Comic Sans MS", cursive',
            custom: `${JSON.stringify(String(s.customFont || "Arial"))}, sans-serif`,
        };
        const font = fonts[s.font] || fonts["sans-serif"];
        const scale = Number(s.textScale);
        let textOffset = 0;
        if (s.showTitle && s.title) {
            let size = (portrait ? 64 : 62) * u * scale;
            c.font = `700 ${size}px ${font}`;
            while (c.measureText(s.title).width > maxWidth && size > 20 * u) {
                size -= u;
                c.font = `700 ${size}px ${font}`;
            }
            c.fillText(s.title, textX, textY, maxWidth);
            textOffset += 62 * u * scale;
        }
        if (s.showArtist && s.artist) {
            c.globalAlpha = 0.62;
            c.font = `400 ${29 * u * scale}px ${font}`;
            c.fillText(s.artist, textX, textY + textOffset, maxWidth);
            textOffset += 50 * u * scale;
        }
        if (s.showChannel && s.channel) {
            c.globalAlpha = 0.9;
            c.fillStyle = s.primary;
            c.font = `500 ${21 * u * scale}px ${font}`;
            c.fillText(s.channel, textX, textY + textOffset, maxWidth);
        }
        c.globalAlpha = 1;
        if (s.watermark && s.watermarkText) {
            c.textAlign = "left";
            c.fillStyle = s.textColor;
            c.globalAlpha = 0.65;
            c.font = `700 ${20 * u}px ${font}`;
            c.fillText(s.watermarkText, 68 * u, 66 * u, w * 0.6);
            c.globalAlpha = 1;
        }
        if (s.showProgress) {
            const margin = 68 * u;
            const y = h - 60 * u;
            const start = Number(s.clipStart);
            const duration = Math.max(0.01, Number(s.clipEnd) - start);
            const fraction = Math.max(0, Math.min(1, (time - start) / duration));
            const lineEnd = w - margin - 110 * u;
            c.strokeStyle = "#ffffff20";
            c.lineWidth = 2 * u;
            c.beginPath();
            c.moveTo(margin, y);
            c.lineTo(lineEnd, y);
            c.stroke();
            c.strokeStyle = s.primary;
            c.beginPath();
            c.moveTo(margin, y);
            c.lineTo(margin + (lineEnd - margin) * fraction, y);
            c.stroke();
            c.textAlign = "right";
            c.fillStyle = "#ffffff88";
            c.font = `${19 * u}px monospace`;
            c.fillText(formatTime(Math.max(0, time - start)), w - margin, y);
        }
        if (s.vignette) {
            const vignette = c.createRadialGradient(
                w / 2,
                h / 2,
                Math.min(w, h) * 0.2,
                w / 2,
                h / 2,
                Math.max(w, h) * 0.76
            );
            vignette.addColorStop(0, "#00000000");
            vignette.addColorStop(1, "#00000077");
            c.fillStyle = vignette;
            c.fillRect(0, 0, w, h);
        }
        if (s.flashEnabled) {
            c.save();
            const flash =
                s.flashMode === "timer"
                    ? Math.pow((1 + Math.cos(2 * Math.PI * Number(s.flashRate) * effectTime)) / 2, 6)
                    : beatPulse;
            c.globalAlpha = Number(s.flashAmount) * flash;
            c.fillStyle = s.flashColor;
            c.fillRect(0, 0, w, h);
            c.restore();
        }
        if (this.exporting && this.exportFade < 1) {
            c.fillStyle = `rgba(0,0,0,${1 - this.exportFade})`;
            c.fillRect(0, 0, w, h);
        }
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frame);
    }
}
