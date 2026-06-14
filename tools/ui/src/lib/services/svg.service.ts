import {
	SVG_EMPTY_OUTPUT,
	SVG_OUTPUT_MAX_BYTES,
	SVG_TRUNCATION_NOTICE,
	RENDER_SVG_TOOL_NAME
} from '$lib/constants';
import type { ToolExecutionResult } from '$lib/types';

/**
 * Sanitize SVG markup by stripping dangerous elements, attributes, and protocols.
 *
 * Removes:
 * - <script> and <style> elements
 * - Event handler attributes (on*)
 * - javascript: URLs
 * - <iframe>, <object>, <embed> elements
 *
 * @param svg - Raw SVG markup
 * @returns Sanitized SVG markup
 */
function sanitizeSvg(svg: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svg, 'image/svg+xml');

	// Check for parse errors
	const parseError = doc.querySelector('parsererror');
	if (parseError) {
		return svg; // Fall back to original if parse fails badly
	}

	// Remove dangerous elements
	const dangerousElements = ['script', 'style', 'iframe', 'object', 'embed'];
	for (const tag of dangerousElements) {
		for (const el of doc.querySelectorAll(tag)) {
			el.remove();
		}
	}

	// Remove event handler attributes from all elements
	const allElements = doc.querySelectorAll('*');
	for (const el of allElements) {
		const attrs = el.attributes;
		for (let i = attrs.length - 1; i >= 0; i--) {
			const attrName = attrs[i].name;
			if (attrName.startsWith('on')) {
				el.removeAttribute(attrName);
			}
		}

		// Sanitize href and src attributes
		for (const attrName of ['href', 'src', 'xlink:href']) {
			const val = el.getAttribute(attrName);
			if (val && /^javascript:\s*/i.test(val.trim())) {
				el.removeAttribute(attrName);
			}
		}
	}

	const serializer = new XMLSerializer();
	let result = serializer.serializeToString(doc);

	// Ensure it starts with <svg
	const svgMatch = result.match(/<svg[\s>]/i);
	if (svgMatch) {
		result = result.slice(svgMatch.index!);
	} else {
		// Wrap bare content in <svg>
		result = `<svg xmlns="http://www.w3.org/2000/svg">${result}</svg>`;
	}

	return result;
}

function formatSvgResult(svg: string, title?: string): ToolExecutionResult {
	let content = svg;

	if (content.length > SVG_OUTPUT_MAX_BYTES) {
		content = `${content.slice(0, SVG_OUTPUT_MAX_BYTES)}\n${SVG_TRUNCATION_NOTICE}`;
		return { content, isError: false };
	}

	if (!content.trim()) {
		return { content: SVG_EMPTY_OUTPUT, isError: false };
	}

	const sanitized = sanitizeSvg(content);

	// Build a display string that the frontend can recognize as SVG
	const displayLines: string[] = [];
	if (title) {
		displayLines.push(`[SVG: ${title}]`);
	}
	displayLines.push(sanitized);

	return { content: displayLines.join('\n'), isError: false };
}

export class SvgService {
	static executeTool(
		toolName: string,
		params: Record<string, unknown>
	): Promise<ToolExecutionResult> {
		if (toolName !== RENDER_SVG_TOOL_NAME) {
			return Promise.resolve({ content: `Unknown frontend tool: ${toolName}`, isError: true });
		}

		const svg = typeof params.svg === 'string' ? params.svg : '';
		if (!svg.trim()) {
			return Promise.resolve({ content: 'Missing required parameter: svg', isError: true });
		}

		const title = typeof params.title === 'string' ? params.title : undefined;

		return Promise.resolve(formatSvgResult(svg, title));
	}
}
