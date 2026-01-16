<script>
  import { createEventDispatcher } from 'svelte';

  export let data = { title: 'Philly Bike Train', subtitle: '' };
  export let readonly = false;

  const dispatch = createEventDispatcher();

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

  <div class="text-xs text-warm-gray-500 bg-warm-gray-50 rounded p-2">
    The header appears at the top of every email with your brand colors.
  </div>
</div>
