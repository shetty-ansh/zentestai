import { Page, Locator } from 'playwright';
import { config } from '../utils/config';
import { EnrichedElement, PageState } from '../agent/types';

/**
 * State Extractor - Extracts page state for LLM
 * 
 * Per user feedback:
 * - Give MAX clean info to LLM, only remove DEFINITELY unnecessary
 * - Include hierarchy/structure, not just element info
 * - Screenshots included for visual context
 */
export class StateExtractor {
    private elementCounter: number = 0;
    private elementMap: Map<string, string> = new Map(); // id -> selector

    /**
     * Extract complete page state for LLM
     */
    async extractState(page: Page): Promise<PageState> {
        this.elementCounter = 0;
        this.elementMap.clear();

        // 1. Extract elements first (injects IDs)
        const elements = await this.extractInteractiveElements(page);

        // 2. Extract DOM and screenshot (DOM will now have IDs)
        const [dom, screenshot, title] = await Promise.all([
            this.extractCleanedDOM(page),
            this.captureScreenshot(page),
            page.title(),
        ]);

        return {
            url: page.url(),
            title,
            dom,
            elements,
            screenshot,
            timestamp: new Date(),
            viewportSize: page.viewportSize() || { width: 1280, height: 900 },
        };
    }

    /**
     * Get selector for an element ID
     */
    getSelectorForId(elementId: string): string | undefined {
        return this.elementMap.get(elementId);
    }

    /**
     * Extract cleaned DOM with hierarchy preserved
     * 
     * Only removes DEFINITELY unnecessary:
     * - <script> tags
     * - <style> tags
     * - <noscript> tags
     * - Comments
     * - Hidden elements (display:none, hidden attribute)
     * - Inline styles (but keep style attribute for context)
     * 
     * KEEPS:
     * - All visible elements
     * - Classes (even if obfuscated - can help LLM)
     * - Data attributes
     * - Hierarchy/nesting structure
     * - ARIA attributes
     */
    private async extractCleanedDOM(page: Page): Promise<string> {
        return await page.evaluate(() => {
            // Clone the document to avoid modifying the real DOM
            const clone = document.documentElement.cloneNode(true) as HTMLElement;

            // 1. REMOVE NOISE (Script, Style, Hidden, etc.)
            const toRemove = clone.querySelectorAll(
                'script, style, noscript, link, meta, svg, iframe, ' +
                '[hidden], [style*="display: none"], [style*="display:none"], ' +
                '[aria-hidden="true"]'
            );
            toRemove.forEach(el => el.remove());

            // Remove comments
            const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
            const comments: Comment[] = [];
            while (walker.nextNode()) comments.push(walker.currentNode as Comment);
            comments.forEach(c => c.remove());

            // 2. D2SNAP HELPERS

            // Check if element is interactive (priority KEEP)
            const isInteractive = (el: Element): boolean => {
                const tag = el.tagName.toLowerCase();
                const role = el.getAttribute('role');
                return (
                    tag === 'a' || tag === 'button' || tag === 'input' ||
                    tag === 'select' || tag === 'textarea' ||
                    role === 'button' || role === 'link' || role === 'checkbox' ||
                    role === 'menuitem' || role === 'tab' ||
                    el.hasAttribute('onclick') || el.hasAttribute('data-agent-id')
                );
            };

            // Convert logical blocks to Markdown (D2Snap Content Downsampling)
            const toMarkdown = (el: Element): string | null => {
                // If it contains interactive elements, don't markdown-ify heavily
                if (el.querySelector('[data-agent-id]')) return null;

                const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
                if (!text) return '';

                const tag = el.tagName.toLowerCase();
                switch (tag) {
                    case 'h1': return `# ${text}`;
                    case 'h2': return `## ${text}`;
                    case 'h3': return `### ${text}`;
                    case 'h4': return `#### ${text}`;
                    case 'h5':
                    case 'h6': return `##### ${text}`;
                    case 'p': return `\n${text}\n`;
                    case 'li': return `- ${text}`;
                    case 'b':
                    case 'strong': return `**${text}**`;
                    case 'i':
                    case 'em': return `*${text}*`;
                    default: return null;
                }
            };

            // 3. TRAVERSAL & PRUNING
            const process = (node: Element, indent: number = 0): string => {
                const spaces = '  '.repeat(indent);
                const tag = node.tagName.toLowerCase();

                // Interactive -> KEEP TAG fully
                if (isInteractive(node) || node.hasAttribute('data-agent-id')) {
                    // Extract minimal attributes
                    const attrs: string[] = [];
                    for (const attr of Array.from(node.attributes)) {
                        if (['id', 'class', 'href', 'src', 'type', 'name', 'value',
                            'placeholder', 'aria-label', 'role', 'data-agent-id']
                            .includes(attr.name) || attr.name.startsWith('aria-')) {
                            attrs.push(`${attr.name}="${attr.value}"`);
                        }
                    }
                    const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
                    const content = node.textContent?.slice(0, 50) || '';
                    return `${spaces}<${tag}${attrStr}>${content}</${tag}>`;
                }

                // Try Markdown conversion for content
                const md = toMarkdown(node);
                if (md !== null) {
                    return `${spaces}${md}`;
                }

                // Container / Other structure -> Recurse
                const children = Array.from(node.children);
                if (children.length === 0) {
                    const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
                    return text ? `${spaces}${text}` : '';
                }

                const childResults = children.map(c => process(c, indent + 1)).filter(s => s.trim());

                // FLATTEN: If div/span/section has no significant attributes and just wraps content
                const hasAttrs = Array.from(node.attributes).some(a =>
                    ['id', 'class', 'role'].includes(a.name) || a.name.startsWith('data-')
                );

                if ((tag === 'div' || tag === 'span' || tag === 'section') && !hasAttrs) {
                    return childResults.join('\n'); // Hoist children
                }

                // Else keep container with limited attributes
                const attrs: string[] = [];
                for (const attr of Array.from(node.attributes)) {
                    if (['id', 'class', 'role'].includes(attr.name)) {
                        attrs.push(`${attr.name}="${attr.value}"`);
                    }
                }
                const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';

                return `${spaces}<${tag}${attrStr}>\n${childResults.join('\n')}\n${spaces}</${tag}>`;
            };

            const body = clone.querySelector('body');
            return body ? process(body) : '';
        });
    }

    /**
     * Extract interactive elements with enriched info
     * Injects data-agent-id for reliable selection
     */
    private async extractInteractiveElements(page: Page): Promise<EnrichedElement[]> {
        const elements: EnrichedElement[] = [];

        // Inject IDs into interactive elements
        await page.evaluate(() => {
            let counter = 0;
            const interactiveSelectors = [
                'a[href]',
                'button',
                'input',
                'select',
                'textarea',
                '[role="button"]',
                '[role="link"]',
                '[role="menuitem"]',
                '[role="tab"]',
                '[role="checkbox"]',
                '[role="radio"]',
                '[onclick]',
                '[tabindex]:not([tabindex="-1"])',
                'label[for]',
                'summary',
            ];

            const allInteractive = document.querySelectorAll(interactiveSelectors.join(', '));
            allInteractive.forEach((el) => {
                if (!el.getAttribute('data-agent-id')) {
                    el.setAttribute('data-agent-id', `elem_${counter++}`);
                }
            });
        });

        // Now extract info about each element
        const rawElements = await page.evaluate(() => {
            const getXPath = (el: Element): string => {
                if (el.id) return `//*[@id="${el.id}"]`;

                const parts: string[] = [];
                let current: Element | null = el;

                while (current && current.nodeType === Node.ELEMENT_NODE) {
                    let index = 1;
                    let sibling = current.previousElementSibling;
                    while (sibling) {
                        if (sibling.tagName === current.tagName) index++;
                        sibling = sibling.previousElementSibling;
                    }
                    const tagName = current.tagName.toLowerCase();
                    parts.unshift(`${tagName}[${index}]`);
                    current = current.parentElement;
                }

                return '/' + parts.join('/');
            };

            const getParentInfo = (el: Element): string | null => {
                const parent = el.closest('nav, header, footer, main, aside, form, dialog, [role="dialog"], [role="navigation"]');
                if (!parent) return null;

                const tag = parent.tagName.toLowerCase();
                const id = parent.id ? `#${parent.id}` : '';
                const role = parent.getAttribute('role');
                return `inside ${role || tag}${id}`;
            };

            const results: any[] = [];
            const elements = document.querySelectorAll('[data-agent-id]');

            elements.forEach((el) => {
                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0 &&
                    rect.top < window.innerHeight &&
                    rect.bottom > 0 &&
                    rect.left < window.innerWidth &&
                    rect.right > 0;

                // Get data attributes
                const dataAttrs: Record<string, string> = {};
                Array.from(el.attributes)
                    .filter(a => a.name.startsWith('data-') && a.name !== 'data-agent-id')
                    .forEach(a => { dataAttrs[a.name] = a.value; });

                const htmlEl = el as HTMLElement;

                results.push({
                    id: el.getAttribute('data-agent-id'),
                    tag: el.tagName.toLowerCase(),
                    text: (htmlEl.innerText || htmlEl.textContent || '').trim().slice(0, 100),
                    classes: Array.from(el.classList),
                    dataAttrs,
                    role: el.getAttribute('role'),
                    ariaLabel: el.getAttribute('aria-label'),
                    placeholder: el.getAttribute('placeholder'),
                    href: el.getAttribute('href'),
                    type: el.getAttribute('type'),
                    xpath: getXPath(el),
                    isVisible,
                    boundingBox: isVisible ? {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    } : null,
                    parentInfo: getParentInfo(el),
                });
            });

            return results;
        });

        // Build enriched elements with multiple selectors
        for (const raw of rawElements) {
            const selector = `[data-agent-id="${raw.id}"]`;
            this.elementMap.set(raw.id, selector);

            elements.push({
                id: raw.id,
                tag: raw.tag,
                text: raw.text,
                classes: raw.classes,
                dataAttrs: raw.dataAttrs,
                role: raw.role,
                ariaLabel: raw.ariaLabel,
                placeholder: raw.placeholder,
                href: raw.href,
                type: raw.type,
                selector: selector,
                xpathBackup: raw.xpath,
                isVisible: raw.isVisible,
                boundingBox: raw.boundingBox,
                parentInfo: raw.parentInfo,
            });
        }

        return elements;
    }

    /**
     * Capture screenshot as base64
     */
    private async captureScreenshot(page: Page): Promise<string> {
        const buffer = await page.screenshot({
            type: 'jpeg',
            quality: 80,  // Optimized: JPEG 80% is ~60% smaller than PNG
            fullPage: false,
        });
        return buffer.toString('base64');
    }
}
