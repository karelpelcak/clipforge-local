# ClipForge Local

ClipForge Local is a small, privacy-friendly web application for turning gaming recordings into vertical clips. Each source recording can contain both gameplay and webcam footage; both regions can be moved and resized independently before export.

Everything runs locally. Uploaded clips are not sent to an external service.

## Features

- Batch queue with up to 10 source videos
- Movable and resizable gameplay and webcam crops
- Independent crop settings for every queued clip
- Fixed 9:16 layout with webcam on top and gameplay below
- YouTube, Twitch, or Kick profile label centered on the split
- Independent nickname for every queued clip
- Local MP4 export in 1080 × 1920 using H.264 and AAC
- One-click ZIP download when exporting multiple clips
- Responsive preview and keyboard-accessible crop controls

## Requirements

- Node.js 20 or newer
- npm

FFmpeg and FFprobe binaries are installed through npm dependencies, so a system-wide FFmpeg installation is not required.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The Vite frontend runs on port `5173`. The local processing server runs on `127.0.0.1:8790`.

## Production build

```bash
npm run build
NODE_ENV=production npm start
```

Open [http://localhost:8790](http://localhost:8790).

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the frontend and processing server in watch mode |
| `npm run check` | Run TypeScript checks |
| `npm run build` | Create a production frontend build |
| `npm start` | Start the processing server and serve a production build |

## Local data

Temporary uploads and rendered clips are stored under `.clipforge/`. This directory is ignored by git. Completed jobs are removed automatically after 24 hours while the server is running.

## Keyboard controls

Focus a crop region and use:

- Arrow keys to move it
- Shift + arrow keys to resize it
- Alt to use a smaller adjustment step

## License

Licensed under the [MIT License](LICENSE).
