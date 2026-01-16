<script>
  import { createEventDispatcher } from 'svelte';

  export let data = { subhead: '', paragraphs: [''], alignment: 'left' };
  export let readonly = false;

  const dispatch = createEventDispatcher();

  // Ensure paragraphs is an array
  $: paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [''];

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

    <div class="space-y-2">
      {#each paragraphs as paragraph, index (index)}
        <div class="relative">
          <textarea
            value={paragraph}
            on:input={(e) => handleParagraphChange(index, e.target.value)}
            disabled={readonly}
            placeholder="Write your content here... Use **bold** for emphasis, *italic* for style, and [text](url) for links."
            rows="3"
            class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50 text-sm resize-none"
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
    <strong>Formatting:</strong> **bold**, *italic*, [link text](https://url.com)
  </div>
</div>
