const MAX_LEN = 100;

function browserOf(ua: string): string | null {
    if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
    if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
    if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
    if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return null;
}

// Device-style names, not phone models: Chrome's reduced UA reports the model as "K",
// so model parsing would be unreliable.
function deviceOf(ua: string, maxTouchPoints: number): string | null {
    if (/iPhone|iPod/.test(ua)) return "iPhone";
    if (/iPad/.test(ua)) return "iPad";
    // iPadOS 13+ requests the desktop site by default, so its UA claims Macintosh; touch points tell it apart.
    if (/Macintosh/.test(ua) && maxTouchPoints > 1) return "iPad";
    if (/Android/.test(ua)) return "Android";
    if (/Windows/.test(ua)) return "Windows";
    if (/CrOS/.test(ua)) return "Chromebook";
    if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
    if (/Linux|X11/.test(ua)) return "Linux";
    return null;
}

export function describeDevice(userAgent: string, maxTouchPoints = 0): string {
    const browser = browserOf(userAgent);
    const device = deviceOf(userAgent, maxTouchPoints);
    const label = browser && device ? `${browser} on ${device}` : (browser ?? device ?? "Unknown device");
    return label.slice(0, MAX_LEN);
}
