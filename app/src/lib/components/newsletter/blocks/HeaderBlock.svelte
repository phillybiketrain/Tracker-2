<script>
  import { createEventDispatcher } from 'svelte';

  export let data = { title: 'Philly Bike Train', subtitle: '', backgroundColor: '#FF9F66' };
  export let readonly = false;

  const dispatch = createEventDispatcher();

  // Brand color options
  const colorOptions = [
    { value: '#FF9F66', label: 'Primary Orange' },
    { value: '#6FB3B8', label: 'Teal' },
    { value: '#E8B4BC', label: 'Soft Pink' },
    { value: '#3F3D38', label: 'Dark Gray' },
    { value: '#2D5A27', label: 'Forest Green' }
  ];

  function handleInput(field, value) {
    dispatch('update', { [field]: value });
  }
</script>

<div class="space-y-3">
  <div>
    <label class="block text-sm font-medium text-warm-gray-700 mb-1">Header Title</label>
    <input
      type="text"
      value={data.title || 'Philly Bike Train'}
      on:input={(e) => handleInput('title', e.target.value)}
      disabled={readonly}
      placeholder="Newsletter title"
      class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50"
    />
  </div>

  <div>
    <label class="block text-sm font-medium text-warm-gray-700 mb-1">
      Subtitle
      <span class="font-normal text-warm-gray-500">(optional)</span>
    </label>
    <input
      type="text"
      value={data.subtitle || ''}
      on:input={(e) => handleInput('subtitle', e.target.value)}
      disabled={readonly}
      placeholder="e.g., February 2024 Newsletter"
      class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50 text-sm"
    />
  </div>

  <div>
    <label class="block text-sm font-medium text-warm-gray-700 mb-2">Background Color</label>
    <div class="flex flex-wrap gap-2">
      {#each colorOptions as color}
        <button
          on:click={() => !readonly && handleInput('backgroundColor', color.value)}
          disabled={readonly}
          class="w-10 h-10 rounded-lg border-2 transition-all {(data.backgroundColor || '#FF9F66') === color.value ? 'border-warm-gray-900 ring-2 ring-offset-2 ring-warm-gray-400' : 'border-warm-gray-200 hover:border-warm-gray-400'}"
          style="background-color: {color.value}"
          title={color.label}
        />
      {/each}
    </div>
  </div>

  <div class="text-xs text-warm-gray-500 bg-warm-gray-50 rounded p-2">
    The header appears at the top of every email.
  </div>
</div>
