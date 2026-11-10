# CopyableValue

A standalone .NET 10 Blazor WebAssembly application demonstrating accessible text
copying and browser-based image copying and pasting. Clipboard operations run
client-side through small JavaScript modules; no backend service is required.

## Features

- Reusable text display with a label, Copy button, and parent callbacks.
- Exact-value copying that preserves whitespace, line breaks, and token characters.
- Temporary success feedback, visible errors, and polite screen-reader announcements.
- Image selection, preview, copying as PNG, and clipboard pasting.
- Keyboard support and responsive layouts.
- Client-side image processing without uploading files.

## Requirements

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0).
- A modern browser with JavaScript and WebAssembly enabled.
- HTTPS or localhost for Clipboard API operations.
- Node.js 22 or later only if running the JavaScript regression tests.

Clipboard image support and permission prompts vary by browser and operating
system. A browser may support text copying without supporting image reading.

## Getting started

Run these commands from the application directory:

```powershell
dotnet restore
dotnet run
```

The default HTTP launch profile serves the application at
<http://localhost:5095>. Use the URL printed in your terminal if it differs.

To run the HTTPS profile:

```powershell
dotnet dev-certs https --trust
dotnet run --launch-profile https
```

The configured HTTPS address is <https://localhost:7245>.

## Text clipboard component

`Components\CopyableValue.razor` contains the component, with collocated CSS and
JavaScript. The home page demonstrates tokens, URLs, multiline text, empty values,
and disabled values. Successful feedback resets after two seconds; failures remain
visible until another attempt.

### Usage

```razor
@using global::CopyableValue.Components

<CopyableValue Label="Reference" Value="REF-10428"
               OnCopied="HandleCopied"
               OnCopyFailed="HandleCopyFailure" />

<p>@_message</p>

@code {
    private string _message = "";

    private void HandleCopied(string value) =>
        _message = $"{value} is ready to paste.";

    private void HandleCopyFailure(string message) =>
        _message = message;
}
```

### Parameters

| Parameter | Type | Default / purpose |
|-----------|------|-------------------|
| `Label` | `string` | Required. Accessible label for the displayed value. |
| `Value` | `string` | Required. Complete text to display and copy. Empty values disable copying. |
| `CopyText` | `string` | `Copy` |
| `SuccessMessage` | `string` | `Copied to the clipboard.` |
| `FailureMessage` | `string` | `Could not copy the value.` |
| `Disabled` | `bool` | `false` |
| `OnCopied` | `EventCallback<string>` | Receives the exact copied value after a successful write. |
| `OnCopyFailed` | `EventCallback<string>` | Receives the failure message after a JavaScript clipboard error. |
| `ModulePath` | `string` | `./Components/CopyableValue.razor.js` |

The native button supports Tab, Enter, and Space. While copying, the handler
blocks concurrent attempts and the button remains focusable. Each component
instance maintains independent status.

To reuse the component, copy its `.razor`, `.razor.css`, and `.razor.js` files
into the destination application and import the destination namespace. If moving
the component, update `ModulePath` to its new JavaScript module URL.

## Image clipboard

The home page also includes `Components\ImageClipboard.razor`. Choose a PNG, JPEG,
WebP, or GIF file, then use **Copy image** to place a PNG on the clipboard.
Use **Paste image** to read an image from the clipboard, or focus the preview area
and press **Ctrl+V** (**Command+V** on Mac). The preview becomes the image available
for the next copy. Animated images are flattened to one frame.

To include the panel on another page in this application:

```razor
@using global::CopyableValue.Components

<ImageClipboard />
```

The panel has no required parameters. Its JavaScript module is collocated at
`Components\ImageClipboard.razor.js`; update the import in the component if moving
these files.

Images stay in the browser and are never uploaded. Input images are limited to
10 MB (10 MiB, or 10,485,760 bytes) and 16 million pixels. Replaced previews and disposed components release
their object URLs. Invalid files, non-image clipboard contents, and permission
failures display accessible feedback without discarding the previous image.

Image conversion preserves the visual content as a PNG, not the original file
bytes, metadata, or animation. Previews are held in memory and are not saved
between page reloads.

Clipboard buttons require HTTPS or localhost, browser support for `ClipboardItem`
and the asynchronous Clipboard API, and permission from the browser. Keyboard
pasting into the preview is an alternative when clipboard reading is unavailable
or denied. Browser and operating-system clipboard restrictions still apply.

### Copying from Windows File Explorer

Explorer's **Copy** command usually copies a file reference rather than image
pixels. The **Paste image** button can only read formats exposed by the browser's
Clipboard API; it cannot resolve local file references or read arbitrary paths.
Focus the preview and press **Ctrl+V** to paste the file when the browser exposes
it through a paste event. Files with missing or generic MIME types are identified
by their PNG, JPEG, WebP, or GIF signature and decoded before use.

If the browser does not expose the copied file, use **Choose an image**, or open
the image in an image viewer/browser and copy its image contents instead.

## Project structure

| Path | Purpose |
|------|---------|
| `Components\CopyableValue.razor` | Reusable text clipboard component. |
| `Components\CopyableValue.razor.css` | Scoped text component styles. |
| `Components\CopyableValue.razor.js` | Text clipboard write operation. |
| `Components\ImageClipboard.razor` | Image panel and accessible status rendering. |
| `Components\ImageClipboard.razor.css` | Scoped image panel styles. |
| `Components\ImageClipboard.razor.js` | File handling, image conversion, clipboard operations, and preview cleanup. |
| `Pages\Home.razor` | Home page containing the text and image demonstrations. |
| `Layout\MainLayout.razor` | Application shell. |
| `wwwroot\css\app.css` | Global styles. |
| `tests\image-clipboard.test.mjs` | JavaScript regression tests for file pasting and fallback messages. |

## Build and test

```powershell
dotnet build
node --test tests\image-clipboard.test.mjs
```

The JavaScript tests use Node's built-in test runner; no npm packages are required.
They simulate browser APIs to cover file-list and clipboard-item handling, missing
or generic MIME types, invalid content, fallback guidance, and preview preservation.
They do not replace testing actual clipboard permissions in a browser.

For manual browser checks, copy text with Enter and Space, paste copied text into
another application, copy and paste an image, try Explorer file pasting with Ctrl+V,
and verify feedback when clipboard permission is denied.

## Publishing

```powershell
dotnet publish --configuration Release
```

Deploy the contents of `bin\Release\net10.0\publish\wwwroot` to a static web host
over HTTPS. Configure the host to serve Blazor's static assets and fall back to
`index.html` for client-side routes. If hosting under a subpath, update the
`<base href="/">` in `wwwroot\index.html` to match that path before publishing.

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Clipboard access is denied | Allow clipboard permission if prompted. For image pasting, focus the preview and try Ctrl+V / Command+V. |
| Copying works locally but not after deployment | Use HTTPS and check the host's browser permission policies. |
| Explorer Copy does not work with Paste image | Try Ctrl+V in the preview; if the browser does not expose the file, use the file picker or copy image contents from an image viewer. |
| Clipboard contains no supported image | Copy actual image content or choose a supported image file. Text paths and file references cannot be resolved by the app. |
| Image is rejected | Use a valid PNG, JPEG, WebP, or GIF within the file-size and pixel limits. Renaming a file extension does not convert it. |
| Image tools could not load | Reload the page and check that the collocated JavaScript module is served at its configured URL. |
| Changes do not appear | Restart the development server and refresh the browser. |
