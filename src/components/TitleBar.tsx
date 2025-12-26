/**
 * TitleBar Component
 *-
 * Top bar so the terminal doesnt look "out of place"
 * Currently just a placeholder since i plan on adding user customization
 * */

import { getCurrentWindow } from '@tauri-apps/api/window';

export function TitleBar() {
  return (
    <div data-tauri-drag-region className="custom-titlebar">
      <div className="titlebar-logo">Packet</div>
      <div className="titlebar-controls">
        <button onClick={() => getCurrentWindow().minimize()}>_</button>
        <button onClick={() => getCurrentWindow().toggleMaximize()}>□</button>
        <button onClick={() => getCurrentWindow().close()} className="close-btn">×</button>
      </div>
    </div>
  );
}
