// A date and time in the editor that its writer can change: a tap or click on the chip opens
// the device's date and time picker, and Enter does too while the chip is selected.
import { NodeSelection } from '@tiptap/pm/state';
import { localFieldValue, RelativeTime } from '#lib/editor/extensions.js';
import { editor as text } from '#lib/strings/editor.js';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Opens the field's picker. Called inside the tap's own handler: iOS refuses it anywhere else. */
function openPicker(input: HTMLInputElement) {
	input.focus();
	input.showPicker?.();
}

/**
 * RelativeTime with a field laid transparently over its chip, at least 44px square to tap. On a
 * phone the tap lands on the field itself, which is what makes iOS open its picker. The picked
 * time is stored with this device's zone, as a newly inserted one is.
 */
export const EditableRelativeTime = RelativeTime.extend({
	addNodeView: () => (props) => {
		const { editor, getPos } = props;
		let node = props.node;
		const dom = document.createElement('time');
		dom.className = 'relative-time editable';
		dom.contentEditable = 'false';
		const label = document.createElement('span');
		const input = document.createElement('input');
		input.type = 'datetime-local';
		input.required = true;
		input.setAttribute('aria-label', text.relativeTime.field);
		dom.appendChild(label);
		dom.appendChild(input);

		const show = () => {
			const at: number = node.attrs.timestamp;
			dom.setAttribute('datetime', new Date(at).toISOString());
			dom.title = text.relativeTime.title(at, node.attrs.zone ?? deviceZone());
			label.textContent = text.relativeTime.chip(at, deviceZone());
			input.value = localFieldValue(at);
		};
		show();

		input.addEventListener('click', () => openPicker(input));
		// Enter confirms the time here; left alone it would submit the form around the editor.
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') event.preventDefault();
		});
		// A half-filled or out-of-range field (empty, or a five-digit year) parses to NaN, and
		// the chip keeps the time it had.
		input.addEventListener('change', () => {
			const timestamp = new Date(input.value).getTime();
			if (Number.isNaN(timestamp)) return;
			const attrs = { timestamp, zone: deviceZone() };
			editor.view.dispatch(editor.state.tr.setNodeMarkup(getPos()!, undefined, attrs));
		});

		return {
			dom,
			update: (next) => {
				if (next.type !== node.type) return false;
				node = next;
				show();
				return true;
			},
			stopEvent: (event) => event.target === input,
			ignoreMutation: () => true
		};
	},

	addKeyboardShortcuts() {
		return {
			Enter: ({ editor }) => {
				const { selection } = editor.state;
				if (!(selection instanceof NodeSelection) || selection.node.type !== this.type) {
					return false;
				}
				const input = (editor.view.nodeDOM(selection.from) as HTMLElement).querySelector('input');
				if (!input) throw new Error('expected a selected time to hold its date and time field');
				openPicker(input);
				return true;
			}
		};
	}
});
