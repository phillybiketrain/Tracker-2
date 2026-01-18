<script>
  import { createEventDispatcher } from 'svelte';

  export let data = { subhead: '', paragraphs: [''], alignment: 'left' };
  export let readonly = false;

  const dispatch = createEventDispatcher();

  // Ensure paragraphs is an array
  $: paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [''];

  // Track which textarea is focused for formatting
  let activeTextareaIndex = 0;
  let textareas = [];

  function handleSubheadChange(e) {
    dispatch('update', { subhead: e.target.value });
  }

  function handleParagraphChange(index, value) {
    const newParagraphs = [...paragraphs];
    newParagraphs[index] = value;
    dispatch('update', { paragraphs: newParagraphs });
  }

  function addParagraph() {
    dispatch('update', { paragraphs: [...paragraphs, ''] });
  }

  function removeParagraph(index) {
    if (paragraphs.length <= 1) return;
    const newParagraphs = paragraphs.filter((_, i) => i !== index);
    dispatch('update', { paragraphs: newParagraphs });
  }

  function handleAlignmentChange(e) {
    dispatch('update', { alignment: e.target.value });
  }

  function handleFocus(index) {
    activeTextareaIndex = index;
  }

  function insertAtCursor(text, wrapSelection = false) {
    const textarea = textareas[activeTextareaIndex];
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = paragraphs[activeTextareaIndex];
    const selectedText = currentValue.substring(start, end);

    let newValue;
    let newCursorPos;

    if (wrapSelection && selectedText) {
      // Wrap selected text
      newValue = currentValue.substring(0, start) + text.replace('$1', selectedText) + currentValue.substring(end);
      newCursorPos = start + text.replace('$1', selectedText).length;
    } else {
      // Insert at cursor
      newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
      newCursorPos = start + text.length;
    }

    handleParagraphChange(activeTextareaIndex, newValue);

    // Restore focus and cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }

  function insertBold() {
    const textarea = textareas[activeTextareaIndex];
    if (!textarea) return;
    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    if (selectedText) {
      insertAtCursor(`**${selectedText}**`, false);
    } else {
      insertAtCursor('**bold text**');
    }
  }

  function insertItalic() {
    const textarea = textareas[activeTextareaIndex];
    if (!textarea) return;
    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    if (selectedText) {
      insertAtCursor(`*${selectedText}*`, false);
    } else {
      insertAtCursor('*italic text*');
    }
  }

  function insertLink() {
    const textarea = textareas[activeTextareaIndex];
    if (!textarea) return;
    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    if (selectedText) {
      insertAtCursor(`[${selectedText}](https://)`);
    } else {
      insertAtCursor('[link text](https://)');
    }
  }

  function insertBulletPoint() {
    const textarea = textareas[activeTextareaIndex];
    if (!textarea) return;

    const start = textarea.selectionStart;
    const currentValue = paragraphs[activeTextareaIndex];

    // Find the start of the current line
    const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1;

    // Check if we're already on a bullet line
    const lineContent = currentValue.substring(lineStart);
    if (lineContent.startsWith('• ') || lineContent.startsWith('- ')) {
      return; // Already a bullet point
    }

    // Insert bullet at the start of the line
    const newValue = currentValue.substring(0, lineStart) + '• ' + currentValue.substring(lineStart);
    handleParagraphChange(activeTextareaIndex, newValue);

    // Move cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2);
    }, 0);
  }

  function insertLineBreak() {
    insertAtCursor('\n');
  }
</script>

<div class="space-y-4">
  <div>
    <label class="block text-sm font-medium text-warm-gray-700 mb-1">
      Subhead
      <span class="font-normal text-warm-gray-500">(optional)</span>
    </label>
    <input
      type="text"
      value={data.subhead || ''}
      on:input={handleSubheadChange}
      disabled={readonly}
      placeholder="Section heading"
      class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50"
    />
  </div>

  <div>
    <div class="flex items-center justify-between mb-1">
      <label class="text-sm font-medium text-warm-gray-700">Content</label>
      {#if !readonly && paragraphs.length > 1}
        <span class="text-xs text-warm-gray-500">{paragraphs.length} paragraphs</span>
      {/if}
    </div>

    <!-- Formatting Toolbar -->
    {#if !readonly}
      <div class="flex items-center gap-1 mb-2 p-1 bg-warm-gray-50 rounded border border-warm-gray-200">
        <button
          type="button"
          on:click={insertBold}
          class="px-2 py-1 text-sm font-bold text-warm-gray-700 hover:bg-warm-gray-200 rounded"
          title="Bold (wrap selected text)"
        >
          B
        </button>
        <button
          type="button"
          on:click={insertItalic}
          class="px-2 py-1 text-sm italic text-warm-gray-700 hover:bg-warm-gray-200 rounded"
          title="Italic (wrap selected text)"
        >
          I
        </button>
        <button
          type="button"
          on:click={insertLink}
          class="px-2 py-1 text-sm text-warm-gray-700 hover:bg-warm-gray-200 rounded underline"
          title="Insert link"
        >
          Link
        </button>
        <div class="w-px h-4 bg-warm-gray-300 mx-1"></div>
        <button
          type="button"
          on:click={insertBulletPoint}
          class="px-2 py-1 text-sm text-warm-gray-700 hover:bg-warm-gray-200 rounded"
          title="Add bullet point to current line"
        >
          • List
        </button>
        <button
          type="button"
          on:click={insertLineBreak}
          class="px-2 py-1 text-sm text-warm-gray-700 hover:bg-warm-gray-200 rounded"
          title="Insert line break"
        >
          ↵ Break
        </button>
      </div>
    {/if}

    <div class="space-y-2">
      {#each paragraphs as paragraph, index (index)}
        <div class="relative">
          <textarea
            bind:this={textareas[index]}
            value={paragraph}
            on:input={(e) => handleParagraphChange(index, e.target.value)}
            on:focus={() => handleFocus(index)}
            disabled={readonly}
            placeholder="Write your content here..."
            rows="4"
            class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50 text-sm resize-none font-mono"
          />
          {#if !readonly && paragraphs.length > 1}
            <button
              on:click={() => removeParagraph(index)}
              class="absolute top-2 right-2 w-6 h-6 text-warm-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex items-center justify-center"
              title="Remove paragraph"
            >
              ×
            </button>
          {/if}
        </div>
      {/each}
    </div>

    {#if !readonly}
      <button
        on:click={addParagraph}
        class="mt-2 text-sm text-primary hover:text-primary/80"
      >
        + Add another paragraph
      </button>
    {/if}
  </div>

  <div>
    <label class="block text-sm font-medium text-warm-gray-700 mb-1">Alignment</label>
    <select
      value={data.alignment || 'left'}
      on:change={handleAlignmentChange}
      disabled={readonly}
      class="px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50 text-sm"
    >
      <option value="left">Left</option>
      <option value="center">Center</option>
    </select>
  </div>

  <div class="text-xs text-warm-gray-500 bg-warm-gray-50 rounded p-2">
    <strong>Formatting tips:</strong><br>
    • Lines starting with <code class="bg-warm-gray-200 px-1 rounded">•</code> or <code class="bg-warm-gray-200 px-1 rounded">-</code> become bullet points<br>
    • Use <code class="bg-warm-gray-200 px-1 rounded">**bold**</code> and <code class="bg-warm-gray-200 px-1 rounded">*italic*</code> for emphasis<br>
    • Use <code class="bg-warm-gray-200 px-1 rounded">[text](url)</code> for links
  </div>
</div>
