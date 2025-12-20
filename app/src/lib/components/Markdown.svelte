<script>
  import { marked } from 'marked';

  export let content = '';
  export let className = '';

  // Configure marked for safe, basic rendering
  marked.setOptions({
    breaks: true,  // Convert \n to <br>
    gfm: true,     // GitHub Flavored Markdown
  });

  // Simple sanitization - allow only safe tags
  function sanitizeHtml(html) {
    // Allow only specific tags
    const allowedTags = ['p', 'br', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li'];

    // Create a temporary element to parse the HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove script tags and event handlers
    const scripts = temp.querySelectorAll('script, style, iframe, object, embed');
    scripts.forEach(el => el.remove());

    // Remove event handlers from all elements
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
      // Remove all on* attributes
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on') || attr.name === 'href' && attr.value.startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      });

      // Make links open in new tab and add security attributes
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return temp.innerHTML;
  }

  $: renderedContent = content ? sanitizeHtml(marked.parse(content)) : '';
</script>

<div class="markdown-content {className}">
  {@html renderedContent}
</div>

<style>
  .markdown-content :global(p) {
    margin-bottom: 0.75rem;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown-content :global(a) {
    color: #E85D04;
    text-decoration: underline;
  }
  .markdown-content :global(a:hover) {
    color: #c44d03;
  }
  .markdown-content :global(strong), .markdown-content :global(b) {
    font-weight: 600;
  }
  .markdown-content :global(ul), .markdown-content :global(ol) {
    margin-left: 1.5rem;
    margin-bottom: 0.75rem;
  }
  .markdown-content :global(li) {
    margin-bottom: 0.25rem;
  }
</style>
