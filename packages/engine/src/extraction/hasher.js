export async function hashInput(input) {
    const payload = JSON.stringify({ type: input.type, data: input.data });
    const encoded = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
//# sourceMappingURL=hasher.js.map