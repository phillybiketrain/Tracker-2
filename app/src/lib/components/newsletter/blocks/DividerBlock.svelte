<script>
  import { createEventDispatcher } from 'svelte';

  export let data = { style: 'line' };
  export let readonly = false;

  const dispatch = createEventDispatcher();

  const styleOptions = [
    { value: 'line', label: 'Line', preview: '───────────' },
    { value: 'dots', label: 'Dots', preview: '• • •' },
    { value: 'space', label: 'Space', preview: '(blank space)' }
  ];

  function handleStyleChange(style) {
    if (readonly) return;
    dispatch('update', { style });
  }
</script>

<div class="space-y-3">
  <label class="block text-sm font-medium text-warm-gray-700">Style</label>

  <div class="grid grid-cols-3 gap-2">
    {#each styleOptions as option}
      <button
        on:click={() => handleStyleChange(option.value)}
        disabled={readonly}
        class="p-3 border rounded-lg text-center transition-colors
          {data.style === option.value
            ? 'border-primary bg-primary/5 ring-1 ring-primary'
            : 'border-warm-gray-200 hover:border-warm-gray-300'}
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div class="text-sm font-medium text-warm-gray-700">{option.label}</div>
        <div class="text-xs text-warm-gray-500 mt-1 font-mono">{option.preview}</div>
      </button>
    {/each}
  </div>

  <div class="text-xs text-warm-gray-500 bg-warm-gray-50 rounded p-2">
    Dividers help break up sections of your newsletter.
  </div>
</div>
