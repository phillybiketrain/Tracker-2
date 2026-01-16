<script>
  import { createEventDispatcher } from 'svelte';

  export let data = {
    title: 'Upcoming Rides',
    dateRange: 14,
    tags: [],
    limit: 5,
    showDescription: true,
    showDistance: false
  };
  export let readonly = false;

  const dispatch = createEventDispatcher();

  const dateRangeOptions = [
    { value: 7, label: 'Next 7 days' },
    { value: 14, label: 'Next 2 weeks' },
    { value: 30, label: 'Next 30 days' }
  ];

  const tagOptions = [
    { value: 'regular', label: 'Regular' },
    { value: 'community', label: 'Community' },
    { value: 'special', label: 'Special' }
  ];

  function handleChange(field, value) {
    dispatch('update', { [field]: value });
  }

  function toggleTag(tag) {
    const currentTags = data.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    dispatch('update', { tags: newTags });
  }
</script>

<div class="space-y-4">
  <div>
    <label class="block text-sm font-medium text-warm-gray-700 mb-1">Section Title</label>
    <input
      type="text"
      value={data.title || 'Upcoming Rides'}
      on:input={(e) => handleChange('title', e.target.value)}
      disabled={readonly}
      placeholder="Upcoming Rides"
      class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50"
    />
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label class="block text-sm font-medium text-warm-gray-700 mb-1">Date Range</label>
      <select
        value={data.dateRange || 14}
        on:change={(e) => handleChange('dateRange', parseInt(e.target.value))}
        disabled={readonly}
        class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50 text-sm"
      >
        {#each dateRangeOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>

    <div>
      <label class="block text-sm font-medium text-warm-gray-700 mb-1">Max Rides</label>
      <select
        value={data.limit || 5}
        on:change={(e) => handleChange('limit', parseInt(e.target.value))}
        disabled={readonly}
        class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50 text-sm"
      >
        {#each [3, 5, 7, 10] as num}
          <option value={num}>{num} rides</option>
        {/each}
      </select>
    </div>
  </div>

  <div>
    <label class="block text-sm font-medium text-warm-gray-700 mb-2">
      Filter by Tag
      <span class="font-normal text-warm-gray-500">(optional)</span>
    </label>
    <div class="flex flex-wrap gap-2">
      {#each tagOptions as tag}
        <button
          on:click={() => !readonly && toggleTag(tag.value)}
          disabled={readonly}
          class="px-3 py-1 text-sm rounded-full border transition-colors
            {(data.tags || []).includes(tag.value)
              ? 'bg-primary text-white border-primary'
              : 'bg-white text-warm-gray-700 border-warm-gray-300 hover:border-warm-gray-400'}
            disabled:opacity-50"
        >
          {tag.label}
        </button>
      {/each}
    </div>
    <p class="text-xs text-warm-gray-500 mt-1">Leave empty to show all rides</p>
  </div>

  <div class="space-y-2">
    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        checked={data.showDescription}
        on:change={(e) => handleChange('showDescription', e.target.checked)}
        disabled={readonly}
        class="rounded border-warm-gray-300 text-primary focus:ring-primary"
      />
      <span class="text-sm text-warm-gray-700">Show ride descriptions</span>
    </label>

    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        checked={data.showDistance}
        on:change={(e) => handleChange('showDistance', e.target.checked)}
        disabled={readonly}
        class="rounded border-warm-gray-300 text-primary focus:ring-primary"
      />
      <span class="text-sm text-warm-gray-700">Show distance</span>
    </label>
  </div>

  <div class="text-xs text-warm-gray-500 bg-warm-gray-50 rounded p-2">
    This block automatically pulls upcoming rides from your schedule. The actual rides shown will be determined at send time.
  </div>
</div>
