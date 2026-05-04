/**
 * PasteImage — intercepts paste/drop of images and writes them to disk
 * via Tauri's `save_image` command. The returned absolute path is then
 * inserted into the Tiptap document as an `<img>` whose `src` is run
 * through `convertFileSrc()` so the webview can fetch it through the
 * asset:// protocol.
 *
 * Falls back to a base64 data URL when running outside Tauri (browser
 * dev mode) so the editor still works for testing.
 */

import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { dbSaveImage } from '@/hooks/useDatabase';
import { isTauri } from '@/hooks/useGraph';
import { convertFileSrc } from '@tauri-apps/api/core';

const KEY = new PluginKey('jarvis-paste-image');

export const PasteImage = Extension.create({
  name: 'jarvisPasteImage',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: KEY,
        props: {
          handlePaste(view, event) {
            const items = event.clipboardData?.items;
            if (!items) return false;
            const imageItem = Array.from(items).find((it) => it.type.startsWith('image/'));
            if (!imageItem) return false;
            const file = imageItem.getAsFile();
            if (!file) return false;
            event.preventDefault();
            void insertImage(editor, file, view.state.selection.from);
            return true;
          },

          handleDrop(view, event) {
            const files = event.dataTransfer?.files;
            if (!files || files.length === 0) return false;
            const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
            if (imageFiles.length === 0) return false;
            event.preventDefault();
            for (const file of imageFiles) {
              void insertImage(editor, file, view.state.selection.from);
            }
            return true;
          },
        },
      }),
    ];
  },
});

async function insertImage(
  editor: Editor | null,
  file: File,
  pos: number,
): Promise<void> {
  try {
    let src: string;
    if (isTauri()) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const ext = file.name.split('.').pop()?.toLowerCase();
      const path = await dbSaveImage(buf, ext);
      src = convertFileSrc(path);
    } else {
      src = await fileToDataUrl(file);
    }
    editor?.chain().focus().insertContentAt(pos, {
      type: 'image',
      attrs: { src, alt: file.name },
    }).run();
  } catch (err) {
    console.error('[jarvis] paste image failed', err);
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
