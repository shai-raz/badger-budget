const MAX_LEN = 100;

function browserOf(ua: string): string | null {
    if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
    if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
    if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
    if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return null;
}

function osOf(ua: string): string | null {
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    if (/Windows/.test(ua)) return "Windows";
    if (/CrOS/.test(ua)) return "ChromeOS";
    if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
    if (/Linux|X11/.test(ua)) return "Linux";
    return null;
}

export function describeDevice(userAgent: string): string {
    const browser = browserOf(userAgent);
    const os = osOf(userAgent);
    const label = browser && os ? `${browser} on ${os}` : (browser ?? os ?? "Passkey");
    return label.slice(0, MAX_LEN);
}
