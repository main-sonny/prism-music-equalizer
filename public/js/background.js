import gifCodec from "../vendor/omggif.js";

export async function decodeBackground(url) {
    if (!/^data:image\/gif;/i.test(url)) {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
    }
    const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const reader = new gifCodec.GifReader(data);
    const count = reader.numFrames();
    const { width, height } = reader;
    if (!count || !width || !height) throw new Error("The GIF contains no decodable frames.");
    if (count > 1000 || width * height > 16000000)
        throw new Error("GIF is too large. Use up to 1000 frames and 16 megapixels per frame.");
    const scale = Math.min(1, 1280 / Math.max(width, height), Math.sqrt(48000000 / (count * width * height)));
    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
    const ctx = surface.getContext("2d");
    let pixels = new Uint8ClampedArray(width * height * 4);
    const frames = [];
    let duration = 0;
    for (let i = 0; i < count; i++) {
        const info = reader.frameInfo(i);
        if (info.x + info.width > width || info.y + info.height > height)
            throw new Error("Invalid GIF frame dimensions.");
        const previous = info.disposal === 3 ? pixels.slice() : null;
        reader.decodeAndBlitFrameRGBA(i, pixels);
        ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(width * scale));
        canvas.height = Math.max(1, Math.floor(height * scale));
        canvas.getContext("2d").drawImage(surface, 0, 0, canvas.width, canvas.height);
        duration += Math.max(0.02, info.delay ? info.delay / 100 : 0.1);
        frames.push({ image: canvas, end: duration });
        if (info.disposal === 2) {
            for (let y = info.y; y < info.y + info.height; y++)
                pixels.fill(0, (y * width + info.x) * 4, (y * width + info.x + info.width) * 4);
        } else if (previous) pixels = previous;
        if (i % 16 === 15) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { frames, duration };
}
