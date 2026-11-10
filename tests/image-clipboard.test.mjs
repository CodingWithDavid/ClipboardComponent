import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../Components/ImageClipboard.razor.js", import.meta.url), "utf8");
const { create } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const png = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0];

test("Explorer file paste and clipboard fallbacks", async t => {
    const originals = new Map(
        ["window", "document", "createImageBitmap"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
    );
    const decodedTypes = [];
    globalThis.window = { isSecureContext: true };
    globalThis.document = {
        createElement: () => ({
            getContext: () => ({ drawImage() {} }),
            toBlob: callback => callback(new Blob([png], { type: "image/png" }))
        })
    };
    globalThis.createImageBitmap = async blob => {
        decodedTypes.push(blob.type);
        return { width: 2, height: 2, close() {} };
    };

    function setup() {
        const elements = new Map();
        const states = [];
        const root = {
            querySelector(selector) {
                if (!elements.has(selector)) {
                    const handlers = new Map();
                    elements.set(selector, {
                        handlers,
                        addEventListener: (name, handler) => handlers.set(name, handler),
                        removeEventListener: name => handlers.delete(name)
                    });
                }
                return elements.get(selector);
            }
        };
        const controller = create(root, {
            invokeMethodAsync: async (_, state) => { states.push(state); }
        });
        return {
            root, states, controller,
            async paste(data) {
                let prevented = false;
                root.querySelector(".paste-target").handlers.get("paste")({
                    clipboardData: data,
                    preventDefault() { prevented = true; }
                });
                for (let i = 0; i < 100; i++) {
                    if (states.length && !states.at(-1).busy) {
                        assert.ok(prevented);
                        return states.at(-1);
                    }
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
                assert.fail("Paste did not finish");
            }
        };
    }

    try {
        for (const type of ["", "application/octet-stream", "image/png"]) {
            await t.test(`file list with MIME type '${type}'`, async () => {
                const panel = setup();
                try {
                    const state = await panel.paste({
                        files: [new File([new Uint8Array(png)], "Explorer.png", { type })]
                    });
                    assert.equal(state.error, false);
                    assert.equal(state.name, "Explorer.png");
                    assert.match(state.url, /^blob:/);
                    assert.equal(decodedTypes.at(-1), "image/png");
                } finally {
                    panel.controller.dispose();
                }
            });
        }

        await t.test("item fallback, invalid content, and preserved preview", async () => {
            const panel = setup();
            try {
                const state = await panel.paste({
                    items: [{ kind: "file", type: "", getAsFile: () => new File([new Uint8Array(png)], "image.png") }]
                });
                assert.equal(state.error, false);
                const invalid = await panel.paste({
                    files: [new File(["not an image"], "pretend.png")]
                });
                assert.equal(invalid.error, true);
                assert.equal(invalid.url, state.url);
                assert.match(invalid.status, /Choose an image/);
                const referenceOnly = await panel.paste({ items: [], files: [] });
                assert.equal(referenceOnly.error, true);
                assert.match(referenceOnly.status, /Windows File Explorer/);
            } finally {
                panel.controller.dispose();
                assert.equal(panel.root.querySelector(".paste-target").handlers.size, 0);
            }
        });
    } finally {
        for (const [key, descriptor] of originals) {
            if (descriptor)
                Object.defineProperty(globalThis, key, descriptor);
            else
                delete globalThis[key];
        }
    }
});
