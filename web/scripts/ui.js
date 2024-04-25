import { api } from "./api.js";
import { ComfyDialog as _ComfyDialog } from "./ui/dialog.js";
import { toggleSwitch } from "./ui/toggleSwitch.js";
import { ComfySettingsDialog } from "./ui/settings.js";

export const ComfyDialog = _ComfyDialog;

/**
 *
 * @param { string } tag HTML Element Tag and optional classes e.g. div.class1.class2
 * @param { string | Element | Element[] | {
 * 	 parent?: Element,
 *   $?: (el: Element) => void,
 *   dataset?: DOMStringMap,
 *   style?: CSSStyleDeclaration,
 * 	 for?: string
 * } | undefined } propsOrChildren
 * @param { Element[] | undefined } [children]
 * @returns
 */
export function $el(tag, propsOrChildren, children) {
	const split = tag.split(".");
	const element = document.createElement(split.shift());
	if (split.length > 0) {
		element.classList.add(...split);
	}

	if (propsOrChildren) {
		if (typeof propsOrChildren === "string") {
			propsOrChildren = { textContent: propsOrChildren };
		} else if (propsOrChildren instanceof Element) {
			propsOrChildren = [propsOrChildren];
		}
		if (Array.isArray(propsOrChildren)) {
			element.append(...propsOrChildren);
		} else {
			const {parent, $: cb, dataset, style} = propsOrChildren;
			delete propsOrChildren.parent;
			delete propsOrChildren.$;
			delete propsOrChildren.dataset;
			delete propsOrChildren.style;

			if (Object.hasOwn(propsOrChildren, "for")) {
				element.setAttribute("for", propsOrChildren.for)
			}

			if (style) {
				Object.assign(element.style, style);
			}

			if (dataset) {
				Object.assign(element.dataset, dataset);
			}

			Object.assign(element, propsOrChildren);
			if (children) {
				element.append(...(children instanceof Array ? children : [children]));
			}

			if (parent) {
				parent.append(element);
			}

			if (cb) {
				cb(element);
			}
		}
	}
	return element;
}

function dragElement(dragEl, settings) {
	var posDiffX = 0,
		posDiffY = 0,
		posStartX = 0,
		posStartY = 0,
		newPosX = 0,
		newPosY = 0;
	if (dragEl.getElementsByClassName("drag-handle")[0]) {
		// if present, the handle is where you move the DIV from:
		dragEl.getElementsByClassName("drag-handle")[0].onmousedown = dragMouseDown;
	} else {
		// otherwise, move the DIV from anywhere inside the DIV:
		dragEl.onmousedown = dragMouseDown;
	}

	// When the element resizes (e.g. view queue) ensure it is still in the windows bounds
	const resizeObserver = new ResizeObserver(() => {
		ensureInBounds();
	}).observe(dragEl);

	function ensureInBounds() {
		try {
			newPosX = Math.min(document.body.clientWidth - dragEl.clientWidth, Math.max(0, dragEl.offsetLeft));
			newPosY = Math.min(document.body.clientHeight - dragEl.clientHeight, Math.max(0, dragEl.offsetTop));

			positionElement();
		}
		catch(exception){
			// robust
		}
	}

	function positionElement() {
		const halfWidth = document.body.clientWidth / 2;
		const anchorRight = newPosX + dragEl.clientWidth / 2 > halfWidth;

		// set the element's new position:
		if (anchorRight) {
			dragEl.style.left = "unset";
			dragEl.style.right = document.body.clientWidth - newPosX - dragEl.clientWidth + "px";
		} else {
			dragEl.style.left = newPosX + "px";
			dragEl.style.right = "unset";
		}

		dragEl.style.top = newPosY + "px";
		dragEl.style.bottom = "unset";

		if (savePos) {
			localStorage.setItem(
				"Comfy.MenuPosition",
				JSON.stringify({
					x: dragEl.offsetLeft,
					y: dragEl.offsetTop,
				})
			);
		}
	}

	function restorePos() {
		let pos = localStorage.getItem("Comfy.MenuPosition");
		if (pos) {
			pos = JSON.parse(pos);
			newPosX = pos.x;
			newPosY = pos.y;
			positionElement();
			ensureInBounds();
		}
	}

	let savePos = undefined;
	settings.addSetting({
		id: "Comfy.MenuPosition",
		name: "Save menu position",
		type: "boolean",
		defaultValue: savePos,
		onChange(value) {
			if (savePos === undefined && value) {
				restorePos();
			}
			savePos = value;
		},
	});

	function dragMouseDown(e) {
		e = e || window.event;
		e.preventDefault();
		// get the mouse cursor position at startup:
		posStartX = e.clientX;
		posStartY = e.clientY;
		document.onmouseup = closeDragElement;
		// call a function whenever the cursor moves:
		document.onmousemove = elementDrag;
	}

	function elementDrag(e) {
		e = e || window.event;
		e.preventDefault();

		dragEl.classList.add("comfy-menu-manual-pos");

		// calculate the new cursor position:
		posDiffX = e.clientX - posStartX;
		posDiffY = e.clientY - posStartY;
		posStartX = e.clientX;
		posStartY = e.clientY;

		newPosX = Math.min(document.body.clientWidth - dragEl.clientWidth, Math.max(0, dragEl.offsetLeft + posDiffX));
		newPosY = Math.min(document.body.clientHeight - dragEl.clientHeight, Math.max(0, dragEl.offsetTop + posDiffY));

		positionElement();
	}

	window.addEventListener("resize", () => {
		ensureInBounds();
	});

	function closeDragElement() {
		// stop moving when mouse button is released:
		document.onmouseup = null;
		document.onmousemove = null;
	}
}

class ComfyList {
	#type;
	#text;
	#reverse;

	constructor(text, type, reverse) {
		this.#text = text;
		this.#type = type || text.toLowerCase();
		this.#reverse = reverse || false;
		this.element = $el("div.comfy-list");
		this.element.style.display = "none";
	}

	get visible() {
		return this.element.style.display !== "none";
	}

	async load() {
		const items = await api.getItems(this.#type);
		this.element.replaceChildren(
			...Object.keys(items).flatMap((section) => [
				$el("h4", {
					textContent: section,
				}),
				$el("div.comfy-list-items", [
					...(this.#reverse ? items[section].reverse() : items[section]).map((item) => {
						// Allow items to specify a custom remove action (e.g. for interrupt current prompt)
						const removeAction = item.remove || {
							name: "Delete",
							cb: () => api.deleteItem(this.#type, item.prompt[1]),
						};
						return $el("div", {textContent: item.prompt[0] + ": "}, [
							$el("button", {
								textContent: "Load",
								onclick: async () => {
									await app.loadGraphData(item.prompt[3].extra_pnginfo.workflow);
									if (item.outputs) {
										app.nodeOutputs = item.outputs;
									}
								},
							}),
							$el("button", {
								textContent: removeAction.name,
								onclick: async () => {
									await removeAction.cb();
									await this.update();
								},
							}),
						]);
					}),
				]),
			]),
			$el("div.comfy-list-actions", [
				$el("button", {
					textContent: "Clear " + this.#text,
					onclick: async () => {
						await api.clearItems(this.#type);
						await this.load();
					},
				}),
				$el("button", {textContent: "Refresh", onclick: () => this.load()}),
			])
		);
	}

	async update() {
		if (this.visible) {
			await this.load();
		}
	}

	async show() {
		this.element.style.display = "block";
		this.button.textContent = "Close";

		await this.load();
	}

	hide() {
		this.element.style.display = "none";
		this.button.textContent = "View " + this.#text;
	}

	toggle() {
		if (this.visible) {
			this.hide();
			return false;
		} else {
			this.show();
			return true;
		}
	}
}

export class ComfyUI {
	constructor(app) {
		this.app = app;
		this.dialog = new ComfyDialog();
		this.settings = new ComfySettingsDialog(app);

		this.batchCount = 1;
		this.lastQueueSize = 0;

		const confirmClear = this.settings.addSetting({
			id: "Comfy.ConfirmClear",
			name: "Require confirmation when clearing workflow",
			type: "boolean",
			defaultValue: true,
		});

		const promptFilename = this.settings.addSetting({
			id: "Comfy.PromptFilename",
			name: "Prompt for filename when saving workflow",
			type: "boolean",
			defaultValue: true,
		});

		/**
		 * file format for preview
		 *
		 * format;quality
		 *
		 * ex)
		 * webp;50 -> webp, quality 50
		 * jpeg;80 -> rgb, jpeg, quality 80
		 *
		 * @type {string}
		 */
	}
}
