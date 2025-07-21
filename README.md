
**Advanced Real‑Time Facial Recognition Web App**  
Live demo: [v0-blink-facial-recognition.vercel.app](https://v0-blink-facial-recognition.vercel.app)

---

## 🔍 Overview

`advfacialrec` is a real-time facial recognition web app built with React, TypeScript, and TensorFlow.js. It captures video from your webcam, detects faces, and identifies blinks using pre-trained ML models — all directly in the browser.

This project demonstrates advanced front-end engineering, real-time computer vision, and client-side machine learning.

---

## 🚀 Live Demo

👉 [Click here to try it live](https://v0-blink-facial-recognition.vercel.app)

Allow webcam access and watch real-time detection in action.

---

## 🧩 Features

- 🎥 **Live Webcam Feed** — Streams and processes video instantly.
- 👁 **Face Detection** — Highlights faces in real-time using TensorFlow.js.
- 👀 **Blink Detection** — Tracks eye movement and detects blinks.
- 🖼 **Canvas Overlay** — Bounding boxes and visual feedback directly on video.
- ⚡ **Client-side Inference** — No backend needed; runs fully in-browser.
- 🧱 **Modular Codebase** — Easy to extend with new features or models.

---

## 🛠️ Tech Stack

- **React + TypeScript** — Robust UI architecture with type safety
- **TensorFlow.js** — ML in the browser with fast, optimized models
- **WebRTC APIs** — Access webcam via `navigator.mediaDevices`
- **Canvas API** — Overlay detection boxes with dynamic rendering
- **Vercel** — Auto-deployment for production

---

## 📁 Project Structure

advfacialrec/
├── public/ # Static assets
├── src/
│ ├── components/ # Reusable UI components
│ ├── hooks/ # Custom logic hooks (e.g., useCamera, useBlinkDetection)
│ ├── models/ # ML model loading utilities
│ ├── utils/ # Helper functions (metrics, geometry)
│ ├── App.tsx # Main application logic
│ └── index.tsx # React DOM entry point
├── package.json # Dependencies and scripts
├── tsconfig.json # TypeScript config
└── README.md # Project info

## 📦 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/rsub122/advfacialrec.git
cd advfacialrec

### 2. Install dependencies

npm install

###3. Start the development server

npm run dev
Then open your browser at http://localhost:3000 — allow webcam access to start detection.

###4. Build for production

npm run build
npm start

