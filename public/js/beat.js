export class BassBeat {
    constructor() {
        this.reset();
    }
    reset() {
        this.average = 0;
        this.previous = 0;
        this.lastHit = -Infinity;
        this.lastTime = null;
        this.envelope = 0;
    }
    update(level, time, sensitivity = 1) {
        if (this.lastTime !== null && (time < this.lastTime || time - this.lastTime > 0.5)) this.reset();
        const dt = this.lastTime === null ? 1 / 60 : Math.max(0, time - this.lastTime);
        this.lastTime = time;
        this.envelope *= Math.exp(-dt / 0.12);
        const threshold = Math.max(0.035, this.average * (1 + 0.22 / sensitivity));
        const hit = level > threshold && level - this.previous > 0.012 / sensitivity && time - this.lastHit >= 0.16;
        if (hit) {
            this.envelope = 1;
            this.lastHit = time;
        }
        this.average += (level - this.average) * (1 - Math.exp(-dt / 0.35));
        this.previous = level;
        return this.envelope;
    }
}
