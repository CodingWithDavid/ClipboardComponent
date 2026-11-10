export async function copyText(value) {
    if (!navigator.clipboard) {
        throw new Error("Clipboard API is unavailable. Use HTTPS or localhost.");
    }

    await navigator.clipboard.writeText(value);
}
