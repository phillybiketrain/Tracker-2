<script>
  import { createEventDispatcher } from 'svelte';
  import { API_URL } from '$lib/config.js';

  export let data = { images: [], layout: 'single' };
  export let readonly = false;
  export let token = '';

  const dispatch = createEventDispatcher();

  let uploading = false;
  let uploadError = '';

  $: images = data.images || [];
  $: canAddMore = images.length < 2;

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      uploadError = 'Please select an image file';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      uploadError = 'Image must be less than 5MB';
      return;
    }

    uploadError = '';
    uploading = true;

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(`${API_URL}/admin/newsletters/upload-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const result = await res.json();

      // Add new image
      const newImage = {
        url: result.url,
        alt: file.name.replace(/\.[^/.]+$/, ''),
        caption: ''
      };

      dispatch('update', { images: [...images, newImage] });
    } catch (err) {
      console.error('Upload error:', err);
      uploadError = err.message || 'Failed to upload image';
    } finally {
      uploading = false;
      // Reset file input
      e.target.value = '';
    }
  }

  function updateImage(index, field, value) {
    const newImages = [...images];
    newImages[index] = { ...newImages[index], [field]: value };
    dispatch('update', { images: newImages });
  }

  function removeImage(index) {
    const newImages = images.filter((_, i) => i !== index);
    dispatch('update', { images: newImages });
  }

  function handleLayoutChange(e) {
    dispatch('update', { layout: e.target.value });
  }
</script>

<div class="space-y-4">
  <!-- Uploaded Images -->
  {#if images.length > 0}
    <div class="space-y-3">
      {#each images as image, index (index)}
        <div class="border border-warm-gray-200 rounded-lg p-3">
          <div class="flex gap-3">
            <div class="w-24 h-24 bg-warm-gray-100 rounded overflow-hidden shrink-0">
              <img
                src={image.url}
                alt={image.alt || 'Newsletter image'}
                class="w-full h-full object-cover"
              />
            </div>

            <div class="flex-1 space-y-2">
              <div>
                <label class="block text-xs font-medium text-warm-gray-600 mb-1">Alt Text</label>
                <input
                  type="text"
                  value={image.alt || ''}
                  on:input={(e) => updateImage(index, 'alt', e.target.value)}
                  disabled={readonly}
                  placeholder="Describe the image"
                  class="w-full px-2 py-1 text-sm border border-warm-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-warm-gray-50"
                />
              </div>

              <div>
                <label class="block text-xs font-medium text-warm-gray-600 mb-1">Caption (optional)</label>
                <input
                  type="text"
                  value={image.caption || ''}
                  on:input={(e) => updateImage(index, 'caption', e.target.value)}
                  disabled={readonly}
                  placeholder="Photo caption"
                  class="w-full px-2 py-1 text-sm border border-warm-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-warm-gray-50"
                />
              </div>
            </div>

            {#if !readonly}
              <button
                on:click={() => removeImage(index)}
                class="text-warm-gray-400 hover:text-red-500 p-1"
                title="Remove image"
              >
                ×
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Upload Button -->
  {#if !readonly && canAddMore}
    <div>
      <label
        class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-warm-gray-300 rounded-lg cursor-pointer hover:border-warm-gray-400 hover:bg-warm-gray-50 transition-colors
          {uploading ? 'opacity-50 pointer-events-none' : ''}"
      >
        <div class="text-center">
          {#if uploading}
            <p class="text-sm text-warm-gray-600">Uploading...</p>
          {:else}
            <p class="text-2xl mb-1">📷</p>
            <p class="text-sm text-warm-gray-600">Click to upload an image</p>
            <p class="text-xs text-warm-gray-500 mt-1">PNG, JPG up to 5MB</p>
          {/if}
        </div>
        <input
          type="file"
          accept="image/png, image/jpeg, image/jpg"
          on:change={handleFileSelect}
          disabled={readonly || uploading}
          class="hidden"
        />
      </label>

      {#if uploadError}
        <p class="text-sm text-red-600 mt-2">{uploadError}</p>
      {/if}
    </div>
  {/if}

  <!-- Layout Option -->
  {#if images.length === 2}
    <div>
      <label class="block text-sm font-medium text-warm-gray-700 mb-1">Layout</label>
      <select
        value={data.layout || 'single'}
        on:change={handleLayoutChange}
        disabled={readonly}
        class="px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-warm-gray-50 text-sm"
      >
        <option value="single">Stacked (one per row)</option>
        <option value="side-by-side">Side by side</option>
      </select>
    </div>
  {/if}

  <div class="text-xs text-warm-gray-500 bg-warm-gray-50 rounded p-2">
    Add up to 2 images. Images are automatically optimized for email.
  </div>
</div>
