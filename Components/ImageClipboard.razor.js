const maxBytes = 10 * 1024 * 1024;
const maxPixels = 16_000_000;
const supportedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const filePasteHelp = "If you copied a file in Windows File Explorer, focus the preview and press Ctrl+V. If your browser does not expose the file, use Choose an image instead, or open the image and copy its image contents.";

async function imageType(blob) {
    if (supportedTypes.includes(blob.type))
        return blob.type;
    if (blob.type && blob.type !== "application/octet-stream")
        return null;

    // Explorer file clipboard entries can omit the MIME type. Inspect bytes, not the filename.
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const matches = (signature, offset = 0) =>
        signature.every((value, index) => bytes[offset + index] === value);
    if (matches([137, 80, 78, 71, 13, 10, 26, 10]))
        return "image/png";
    if (matches([255, 216, 255]))
        return "image/jpeg";
    if (matches([71, 73, 70, 56, 55, 97]) || matches([71, 73, 70, 56, 57, 97]))
        return "image/gif";
    if (matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8))
        return "image/webp";
    return null;
}

function transferredFiles(data) {
    const files = [...(data?.files ?? [])];
    if (files.length)
        return files;
    return [...(data?.items ?? [])]
        .filter(item => item.kind === "file")
        .map(item => item.getAsFile())
        .filter(file => file !== null);
}

export function create(root, receiver) {
    const input = root.querySelector("input");
    const target = root.querySelector(".paste-target");
    const copyButton = root.querySelector('[data-action="copy"]');
    const pasteButton = root.querySelector('[data-action="paste"]');
    let image;
    let disposed = false;
    const state = { url: null, name: "", status: "", error: false, busy: false };

    const publish = () => disposed
        ? Promise.resolve()
        : receiver.invokeMethodAsync("UpdateImageState", { ...state });

    async function run(message, operation) {
        if (state.busy || disposed)
            return;

        state.busy = true;
        state.error = false;
        state.status = message;
        try {
            // Start clipboard operations before yielding to preserve user activation.
            await Promise.all([publish(), operation()]);
        } catch (error) {
            state.error = true;
            state.status = error.name === "NotAllowedError"
                ? `Clipboard access was denied or this clipboard format is not exposed by your browser. Allow clipboard access if prompted. ${filePasteHelp}`
                : error.message || "The image operation failed. Try another image.";
        } finally {
            state.busy = false;
            await publish();
        }
    }

    async function load(blob, name) {
        if (blob.size > maxBytes)
            throw new Error("This image is too large. Choose an image smaller than 10 MB.");
        const type = await imageType(blob);
        if (!type)
            throw new Error("Choose or paste a PNG, JPEG, WebP, or GIF image.");
        if (blob.type !== type)
            blob = blob.slice(0, blob.size, type);

        let bitmap;
        try {
            bitmap = await createImageBitmap(blob);
        } catch {
            throw new Error("This image could not be decoded. Choose a valid image file.");
        }

        let png;
        try {
            if (bitmap.width * bitmap.height > maxPixels)
                throw new Error("This image has too many pixels. Choose an image with at most 16 million pixels.");

            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d");
            if (!context)
                throw new Error("Your browser could not prepare this image.");
            context.drawImage(bitmap, 0, 0);
            png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
            if (!png)
                throw new Error("This image could not be converted to PNG.");
        } finally {
            bitmap.close();
        }

        if (disposed)
            return;
        if (state.url)
            URL.revokeObjectURL(state.url);
        image = png;
        state.url = URL.createObjectURL(png);
        state.name = name;
        state.status = `${name} is ready to copy.`;
    }

    function onFile() {
        const file = input.files[0];
        if (file)
            void run("Preparing image...", () => load(file, file.name));
        input.value = "";
    }

    function onCopy() {
        void run("Copying image...", async () => {
            if (!image)
                throw new Error("Choose or paste an image first.");
            if (!window.isSecureContext || !navigator.clipboard?.write || !window.ClipboardItem)
                throw new Error("Image copying is unavailable. Use HTTPS or localhost and a browser that supports image clipboard writing.");
            await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
            state.status = "Image copied to the clipboard.";
        });
    }

    function onRead() {
        void run("Reading clipboard...", async () => {
            if (!window.isSecureContext || !navigator.clipboard?.read)
                throw new Error("Clipboard reading is unavailable. Focus the preview and paste with Ctrl+V / Command+V instead.");
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find(type => supportedTypes.includes(type));
                if (type) {
                    await load(await item.getType(type), "Pasted image");
                    state.status = "Image pasted from the clipboard.";
                    return;
                }
            }
            throw new Error(`No supported image data is available to the Paste image button. ${filePasteHelp}`);
        });
    }

    function onPaste(event) {
        event.preventDefault();
        const files = transferredFiles(event.clipboardData);
        void run("Pasting image...", async () => {
            let file;
            for (const candidate of files) {
                if (await imageType(candidate)) {
                    file = candidate;
                    break;
                }
            }
            if (!file)
                throw new Error(`The browser did not provide a supported image file or image contents. ${filePasteHelp}`);
            await load(file, file.name || "Pasted image");
            state.status = "Image pasted from the clipboard.";
        });
    }

    input.addEventListener("change", onFile);
    copyButton.addEventListener("click", onCopy);
    pasteButton.addEventListener("click", onRead);
    target.addEventListener("paste", onPaste);

    return {
        dispose() {
            disposed = true;
            input.removeEventListener("change", onFile);
            copyButton.removeEventListener("click", onCopy);
            pasteButton.removeEventListener("click", onRead);
            target.removeEventListener("paste", onPaste);
            if (state.url)
                URL.revokeObjectURL(state.url);
            image = undefined;
        }
    };
}
