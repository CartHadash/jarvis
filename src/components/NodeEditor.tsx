/**
 * NodeEditor — Tiptap-backed editor for a node's content.
 *
 * Owns the editor instance for a single node. Receives initial markdown
 * (parsed as HTML by Tiptap), notifies parent on every change so the
 * debounced save in NodePanel can fire.
 */

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';
import { PasteImage } from '@/lib/tiptapExtensions/PasteImage';
import {
  createMentionExtension,
  type MentionConfig,
} from '@/lib/tiptapExtensions/MentionNode';

interface Props {
  /** Stable identifier for the current node — used to reset editor state when
   *  the user switches between nodes. */
  nodeId: string;
  initialContent: string;
  onChange: (html: string) => void;
  onMention: MentionConfig['onPick'];
  placeholder?: string;
}

export function NodeEditor({
  nodeId,
  initialContent,
  onChange,
  onMention,
  placeholder = 'Type, paste an image, or @ to link…',
}: Props) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // We don't ship a code-block highlighter in Phase 1.
          codeBlock: { HTMLAttributes: { class: 'jarvis-code-block' } },
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { class: 'jarvis-link', rel: 'noopener noreferrer' },
        }),
        Image.configure({
          inline: false,
          HTMLAttributes: { class: 'jarvis-img' },
        }),
        Placeholder.configure({ placeholder }),
        PasteImage,
        createMentionExtension({ onPick: onMention }),
      ],
      content: initialContent || '<p></p>',
      autofocus: false,
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML());
      },
      editorProps: {
        attributes: {
          class:
            'jarvis-prose prose prose-invert prose-sm max-w-none focus:outline-none',
        },
      },
    },
    // Re-create the editor whenever the host swaps to a different node,
    // so we don't accidentally write one node's text into another.
    [nodeId],
  );

  // Sync content when the *same* nodeId's content changes externally
  // (e.g. Claude updates it via MCP while user is viewing).
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== initialContent && initialContent) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent]);

  return <EditorContent editor={editor} className="jarvis-editor" />;
}
