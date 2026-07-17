import { nativeImage, NativeImage } from 'electron';
import { logoPng, clockPng } from './logoPng.js';

/**
 * NativeImage-Wrapper um das pure PNG-Rendering in logoPng.ts –
 * bewusst ohne Binär-Assets im Repo.
 */

/** App-Logo (wie public/logo.svg): dunkles Quadrat, türkise Uhr mit Aufzieher */
export function appIcon(size = 256): NativeImage {
  return nativeImage.createFromBuffer(logoPng(size), { scaleFactor: 1 });
}

/** Tray-Icon: schlichte Uhr-Scheibe, Türkis = Timer läuft, Grau = kein Timer */
export function trayIcon(running: boolean): NativeImage {
  return nativeImage.createFromBuffer(clockPng(running), { scaleFactor: 1 });
}
