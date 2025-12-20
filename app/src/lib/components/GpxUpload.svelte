<script>
  import { createEventDispatcher } from 'svelte';
  import { parseGpxFile, validateGpxFile } from '$lib/utils/gpx.js';

  const dispatch = createEventDispatcher();

  let dragOver = false;
  let loading = false;
  let error = null;

  async function handleFile(file) {
    error = null;
    loading = true;

    // Validate file
    const validation = validateGpxFile(file);
    if (!validation.valid) {
      error = validation.error;
      loading = false;
      return;
    }

    // Read and parse
    try {
      const text = await file.text();
      const result = parseGpxFile(text);

      if (result.error) {
        error = result.error;
      } else {
        dispatch('import', { waypoints: result.waypoints, fileName: file.name });
      }
    } catch (e) {
      error = 'Failed to read file';
    }

    loading = false;
  }

  function handleDrop(e) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleInputChange(e) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }
</script>

<div
  class="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
         {dragOver ? 'border-primary bg-orange-50' : 'border-warm-gray-300 hover:border-warm-gray-400'}
         {error ? 'border-red-400 bg-red-50' : ''}"
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
  role="button"
  tabindex="0"
>
  {#if loading}
    <div class="text-warm-gray-600">
      <svg class="animate-spin h-8 w-8 mx-auto mb-3 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p>Processing GPX file...</p>
    </div>
  {:else}
    <div class="text-4xl mb-4">
      <svg class="w-12 h-12 mx-auto text-warm-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <p class="text-warm-gray-700 mb-2 font-medium">
      Drag & drop a GPX file here
    </p>
    <p class="text-warm-gray-500 text-sm mb-4">or</p>
    <label class="btn btn-secondary cursor-pointer inline-block">
      Browse Files
      <input
        type="file"
        accept=".gpx"
        class="hidden"
        on:change={handleInputChange}
      />
    </label>
    <p class="text-warm-gray-400 text-xs mt-4">
      Supports .gpx files up to 10MB
    </p>
  {/if}

  {#if error}
    <div class="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg">
      <p class="text-red-700 text-sm">{error}</p>
    </div>
  {/if}
</div>
