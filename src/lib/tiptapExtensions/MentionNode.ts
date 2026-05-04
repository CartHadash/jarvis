/**
 * MentionNode — wires Tiptap's @ suggestion to Jarvis's node list, and
 * fires a callback when a node is picked. The host (NodeEditor) wires
 * that callback to `dbAddEdge` so picking a mention also creates a
 * graph edge marked `created_by: 'user'`.
 */

import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { computePosition, autoUpdate, offset, flip, shift } from '@floating-ui/react';
import { MentionList, type MentionListRef, type MentionItem } from './MentionList';

export interface MentionConfig {
  /** Called whenever the user picks a node from the @ menu. */
  onPick: (picked: MentionItem) => void;
}

export function createMentionExtension(config: MentionConfig) {
  return Mention.configure({
    HTMLAttributes: {
      class: 'jarvis-mention',
    },
    renderText({ node }) {
      const label: string = node.attrs.label ?? node.attrs.id;
      return `@${label}`;
    },
    renderHTML({ node }) {
      return [
        'span',
        { class: 'jarvis-mention', 'data-mention-id': node.attrs.id },
        `@${node.attrs.label ?? node.attrs.id}`,
      ];
    },
    suggestion: {
      char: '@',
      allowSpaces: false,
      command: ({ editor, range, props }) => {
        const item = props as MentionItem;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'mention',
              attrs: { id: item.id, label: item.title },
            },
            { type: 'text', text: ' ' },
          ])
          .run();
        config.onPick(item);
      },
      items: ({ query }: { query: string }) => {
        // Filtering is done inside MentionList so we have access to the
        // store; we just pass the query through.
        return [{ query } as unknown as MentionItem];
      },
      render: () => {
        let component: ReactRenderer<MentionListRef, { query: string; command: (item: MentionItem) => void }> | null =
          null;
        let popup: HTMLDivElement | null = null;
        let cleanup: (() => void) | null = null;

        return {
          onStart: (props: {
            editor: Editor;
            clientRect?: (() => DOMRect | null) | null;
            query: string;
            command: (item: MentionItem) => void;
          }) => {
            component = new ReactRenderer(MentionList, {
              props: { query: props.query, command: props.command },
              editor: props.editor,
            });
            popup = document.createElement('div');
            popup.className = 'fixed z-50';
            popup.appendChild(component.element);
            document.body.appendChild(popup);

            const rectFn = props.clientRect;
            if (rectFn) {
              const virtualEl = {
                getBoundingClientRect: () => rectFn() ?? new DOMRect(),
              };
              cleanup = autoUpdate(virtualEl, popup, async () => {
                if (!popup) return;
                const { x, y } = await computePosition(virtualEl, popup, {
                  placement: 'bottom-start',
                  middleware: [offset(6), flip(), shift({ padding: 8 })],
                });
                popup.style.transform = `translate(${x}px, ${y}px)`;
                popup.style.top = '0';
                popup.style.left = '0';
              });
            }
          },
          onUpdate: (props: { query: string; command: (item: MentionItem) => void }) => {
            component?.updateProps({ query: props.query, command: props.command });
          },
          onKeyDown: (props: { event: KeyboardEvent }) => {
            if (props.event.key === 'Escape') {
              cleanup?.();
              popup?.remove();
              component?.destroy();
              return true;
            }
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            cleanup?.();
            popup?.remove();
            component?.destroy();
            component = null;
            popup = null;
          },
        };
      },
    },
  });
}
