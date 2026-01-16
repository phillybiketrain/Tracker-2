<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { API_URL } from '$lib/config.js';

  // Block components
  import HeaderBlock from '$lib/components/newsletter/blocks/HeaderBlock.svelte';
  import TextBlock from '$lib/components/newsletter/blocks/TextBlock.svelte';
  import UpcomingRidesBlock from '$lib/components/newsletter/blocks/UpcomingRidesBlock.svelte';
  import PhotoBlock from '$lib/components/newsletter/blocks/PhotoBlock.svelte';
  import DividerBlock from '$lib/components/newsletter/blocks/DividerBlock.svelte';

  let token = '';
  let region = 'philly';
  let newsletterId = null;

  // Newsletter data
  let newsletter = {
    name: '',
    subject: '',
    preheader: '',
    blocks: [],
    status: 'draft'
  };

  // UI state
  let loading = true;
  let saving = false;
  let sendingTest = false;
  let sending = false;
  let previewHtml = '';
  let previewLoading = false;
  let testEmail = '';
  let showTestModal = false;
  let showSendConfirm = false;
  let viewMode = 'desktop'; // desktop | mobile
  let autoSaveTimeout = null;
  let lastSaved = null;
  let openBlockMenu = null; // index of block with open menu
  let subscriberCount = 0;

  // Available block types
  const blockTypes = [
    { type: 'text', label: 'Text', icon: '¶', description: 'Subhead and paragraph' },
    { type: 'upcoming_rides', label: 'Upcoming Rides', icon: '🚲', description: 'Auto-pulls from schedule' },
    { type: 'photo', label: 'Photo', icon: '📷', description: '1-2 images' },
    { type: 'divider', label: 'Divider', icon: '—', description: 'Visual separator' }
  ];

  $: newsletterId = $page.params.id;

  onMount(() => {
    token = localStorage.getItem('admin_token');
    region = localStorage.getItem('admin_region') || 'philly';
    testEmail = localStorage.getItem('admin_email') || '';

    if (!token) {
      goto('/admin');
      return;
    }

    loadNewsletter();
    loadSubscriberCount();
  });

  async function loadSubscriberCount() {
    try {
      const res = await fetch(`${API_URL}/admin/stats?region=${region}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        subscriberCount = data.data?.total_subscribers || 0;
      }
    } catch (err) {
      console.error('Error loading subscriber count:', err);
    }
  }

  function toggleBlockMenu(index) {
    openBlockMenu = openBlockMenu === index ? null : index;
  }

  function closeBlockMenu() {
    openBlockMenu = null;
  }

  async function loadNewsletter() {
    loading = true;
    try {
      const res = await fetch(`${API_URL}/admin/newsletters/${newsletterId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('admin_token');
          goto('/admin');
          return;
        }
        if (res.status === 404) {
          goto('/admin/newsletter');
          return;
        }
        throw new Error('Failed to load newsletter');
      }

      const data = await res.json();
      newsletter = {
        ...data.data,
        blocks: data.data.blocks || []
      };

      // Ensure header block exists
      if (!newsletter.blocks.find(b => b.type === 'header')) {
        newsletter.blocks.unshift({
          id: 'header-1',
          type: 'header',
          data: { title: 'Philly Bike Train', subtitle: '' },
          settings: {}
        });
      }

      await updatePreview();
    } catch (err) {
      console.error('Error loading newsletter:', err);
      alert('Failed to load newsletter');
    } finally {
      loading = false;
    }
  }

  function generateBlockId() {
    return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  function addBlock(type, afterIndex = -1) {
    const newBlock = {
      id: generateBlockId(),
      type,
      data: getDefaultBlockData(type),
      settings: {}
    };

    if (afterIndex === -1) {
      // Add before footer if it exists, otherwise at end
      const footerIndex = newsletter.blocks.findIndex(b => b.type === 'footer');
      if (footerIndex !== -1) {
        newsletter.blocks = [
          ...newsletter.blocks.slice(0, footerIndex),
          newBlock,
          ...newsletter.blocks.slice(footerIndex)
        ];
      } else {
        newsletter.blocks = [...newsletter.blocks, newBlock];
      }
    } else {
      newsletter.blocks = [
        ...newsletter.blocks.slice(0, afterIndex + 1),
        newBlock,
        ...newsletter.blocks.slice(afterIndex + 1)
      ];
    }

    openBlockMenu = null; // Close menu after adding
    triggerAutoSave();
  }

  function getDefaultBlockData(type) {
    switch (type) {
      case 'header':
        return { title: 'Philly Bike Train', subtitle: '', backgroundColor: '#FF9F66' };
      case 'text':
        return { subhead: '', paragraphs: [''], alignment: 'left' };
      case 'upcoming_rides':
        return { title: 'Upcoming Rides', dateRange: 14, tags: [], limit: 5, showDescription: true, showDistance: false };
      case 'photo':
        return { images: [], layout: 'single' };
      case 'divider':
        return { style: 'line' };
      default:
        return {};
    }
  }

  function updateBlock(index, newData) {
    newsletter.blocks[index] = {
      ...newsletter.blocks[index],
      data: { ...newsletter.blocks[index].data, ...newData }
    };
    newsletter.blocks = newsletter.blocks; // Trigger reactivity
    triggerAutoSave();
  }

  function updateBlockSettings(index, newSettings) {
    newsletter.blocks[index] = {
      ...newsletter.blocks[index],
      settings: { ...newsletter.blocks[index].settings, ...newSettings }
    };
    newsletter.blocks = newsletter.blocks;
    triggerAutoSave();
  }

  function moveBlockUp(index) {
    if (index <= 1) return; // Can't move header or first content block above header
    const temp = newsletter.blocks[index];
    newsletter.blocks[index] = newsletter.blocks[index - 1];
    newsletter.blocks[index - 1] = temp;
    newsletter.blocks = newsletter.blocks;
    triggerAutoSave();
  }

  function moveBlockDown(index) {
    if (index >= newsletter.blocks.length - 1) return;
    const temp = newsletter.blocks[index];
    newsletter.blocks[index] = newsletter.blocks[index + 1];
    newsletter.blocks[index + 1] = temp;
    newsletter.blocks = newsletter.blocks;
    triggerAutoSave();
  }

  function deleteBlock(index) {
    const block = newsletter.blocks[index];
    if (block.type === 'header') return; // Can't delete header
    newsletter.blocks = newsletter.blocks.filter((_, i) => i !== index);
    triggerAutoSave();
  }

  function triggerAutoSave() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      saveNewsletter(true);
    }, 1500);
  }

  async function saveNewsletter(isAutoSave = false) {
    if (newsletter.status === 'sent') return;

    saving = true;
    try {
      const res = await fetch(`${API_URL}/admin/newsletters/${newsletterId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newsletter.name,
          subject: newsletter.subject,
          preheader: newsletter.preheader,
          blocks: newsletter.blocks
        })
      });

      if (!res.ok) throw new Error('Failed to save');

      lastSaved = new Date();
      if (!isAutoSave) {
        await updatePreview();
      }
    } catch (err) {
      console.error('Error saving:', err);
      if (!isAutoSave) alert('Failed to save newsletter');
    } finally {
      saving = false;
    }
  }

  async function updatePreview() {
    previewLoading = true;
    try {
      const res = await fetch(`${API_URL}/admin/newsletters/${newsletterId}/preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          blocks: newsletter.blocks,
          subject: newsletter.subject,
          preheader: newsletter.preheader
        })
      });

      if (!res.ok) throw new Error('Failed to generate preview');

      const data = await res.json();
      previewHtml = data.html;
    } catch (err) {
      console.error('Error generating preview:', err);
    } finally {
      previewLoading = false;
    }
  }

  // Debounced preview update
  let previewTimeout = null;
  function triggerPreviewUpdate() {
    if (previewTimeout) clearTimeout(previewTimeout);
    previewTimeout = setTimeout(updatePreview, 800);
  }

  $: if (newsletter.blocks.length > 0 && !loading) {
    triggerPreviewUpdate();
  }

  async function sendTestEmail() {
    if (!testEmail) {
      alert('Please enter a test email address');
      return;
    }

    sendingTest = true;
    try {
      await saveNewsletter();

      const res = await fetch(`${API_URL}/admin/newsletters/${newsletterId}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: testEmail })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send test');
      }

      alert(`Test email sent to ${testEmail}`);
      showTestModal = false;
    } catch (err) {
      console.error('Error sending test:', err);
      alert(err.message);
    } finally {
      sendingTest = false;
    }
  }

  async function sendToSubscribers() {
    if (!newsletter.subject) {
      alert('Please add a subject line before sending');
      return;
    }

    sending = true;
    try {
      await saveNewsletter();

      const res = await fetch(`${API_URL}/admin/newsletters/${newsletterId}/send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send');
      }

      const data = await res.json();
      alert(`Newsletter sent to ${data.recipient_count} subscribers!`);
      showSendConfirm = false;
      await loadNewsletter();
    } catch (err) {
      console.error('Error sending:', err);
      alert(err.message);
    } finally {
      sending = false;
    }
  }

  function formatLastSaved() {
    if (!lastSaved) return '';
    return lastSaved.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<svelte:head>
  <title>{newsletter.name || 'Newsletter'} - Editor - Philly Bike Train</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-warm-gray-200 sticky top-0 z-10">
    <div class="container mx-auto px-6 py-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <a href="/admin/newsletter" class="text-warm-gray-600 hover:text-warm-gray-900">
            ← Back
          </a>
          <div>
            <input
              type="text"
              bind:value={newsletter.name}
              on:blur={() => saveNewsletter()}
              placeholder="Newsletter name"
              disabled={newsletter.status === 'sent'}
              class="text-lg font-bold text-warm-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 w-64"
            />
            <div class="flex items-center gap-2 text-xs text-warm-gray-500 mt-0.5">
              {#if newsletter.status === 'sent'}
                <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded">Sent</span>
              {:else}
                <span class="px-2 py-0.5 bg-warm-gray-100 text-warm-gray-600 rounded">Draft</span>
              {/if}
              {#if saving}
                <span>Saving...</span>
              {:else if lastSaved}
                <span>Saved at {formatLastSaved()}</span>
              {/if}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <!-- Subscriber count -->
          <div class="text-sm text-warm-gray-600">
            <span class="font-medium">{subscriberCount}</span> subscribers
          </div>

          {#if newsletter.status !== 'sent'}
            <!-- Test email button with address shown -->
            <button
              on:click={() => showTestModal = true}
              class="px-4 py-2 text-sm bg-warm-gray-100 text-warm-gray-700 rounded hover:bg-warm-gray-200 transition-colors flex items-center gap-2"
            >
              <span>Send Test</span>
              {#if testEmail}
                <span class="text-xs text-warm-gray-500">→ {testEmail}</span>
              {/if}
            </button>
            <button
              on:click={() => showSendConfirm = true}
              disabled={!newsletter.subject}
              class="px-4 py-2 text-sm bg-primary text-white font-medium rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Send to Subscribers
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <p class="text-warm-gray-600">Loading newsletter...</p>
    </div>
  {:else}
    <div class="container mx-auto px-6 py-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Editor Panel -->
        <div class="space-y-4">
          <!-- Subject & Preheader -->
          <div class="bg-white rounded-lg border border-warm-gray-200 p-4">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-warm-gray-700 mb-1">Subject Line *</label>
                <input
                  type="text"
                  bind:value={newsletter.subject}
                  on:input={triggerAutoSave}
                  placeholder="What's this newsletter about?"
                  disabled={newsletter.status === 'sent'}
                  class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-warm-gray-700 mb-1">
                  Preview Text
                  <span class="font-normal text-warm-gray-500">(shown in inbox)</span>
                </label>
                <input
                  type="text"
                  bind:value={newsletter.preheader}
                  on:input={triggerAutoSave}
                  placeholder="A brief summary that appears in email clients..."
                  disabled={newsletter.status === 'sent'}
                  class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          <!-- Blocks -->
          <div class="space-y-3">
            {#each newsletter.blocks as block, index (block.id)}
              <div class="bg-white rounded-lg border border-warm-gray-200 overflow-hidden">
                <!-- Block Header -->
                <div class="flex items-center justify-between px-4 py-2 bg-warm-gray-50 border-b border-warm-gray-200">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">
                      {#if block.type === 'header'}🚲
                      {:else if block.type === 'text'}¶
                      {:else if block.type === 'upcoming_rides'}📅
                      {:else if block.type === 'photo'}📷
                      {:else if block.type === 'divider'}—
                      {/if}
                    </span>
                    <span class="text-sm font-medium text-warm-gray-700 capitalize">{block.type.replace('_', ' ')}</span>
                  </div>

                  {#if block.type !== 'header' && newsletter.status !== 'sent'}
                    <div class="flex items-center gap-1">
                      <button
                        on:click={() => moveBlockUp(index)}
                        disabled={index <= 1}
                        class="p-1 text-warm-gray-500 hover:text-warm-gray-700 disabled:opacity-30"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        on:click={() => moveBlockDown(index)}
                        disabled={index >= newsletter.blocks.length - 1}
                        class="p-1 text-warm-gray-500 hover:text-warm-gray-700 disabled:opacity-30"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        on:click={() => deleteBlock(index)}
                        class="p-1 text-red-500 hover:text-red-700 ml-2"
                        title="Delete block"
                      >
                        ×
                      </button>
                    </div>
                  {/if}
                </div>

                <!-- Block Content -->
                <div class="p-4">
                  {#if block.type === 'header'}
                    <HeaderBlock
                      data={block.data}
                      readonly={newsletter.status === 'sent'}
                      on:update={(e) => updateBlock(index, e.detail)}
                    />
                  {:else if block.type === 'text'}
                    <TextBlock
                      data={block.data}
                      readonly={newsletter.status === 'sent'}
                      on:update={(e) => updateBlock(index, e.detail)}
                    />
                  {:else if block.type === 'upcoming_rides'}
                    <UpcomingRidesBlock
                      data={block.data}
                      readonly={newsletter.status === 'sent'}
                      on:update={(e) => updateBlock(index, e.detail)}
                    />
                  {:else if block.type === 'photo'}
                    <PhotoBlock
                      data={block.data}
                      readonly={newsletter.status === 'sent'}
                      {token}
                      on:update={(e) => updateBlock(index, e.detail)}
                    />
                  {:else if block.type === 'divider'}
                    <DividerBlock
                      data={block.data}
                      readonly={newsletter.status === 'sent'}
                      on:update={(e) => updateBlock(index, e.detail)}
                    />
                  {/if}
                </div>
              </div>

              <!-- Add Block Button (between blocks) -->
              {#if newsletter.status !== 'sent' && block.type !== 'footer'}
                <div class="flex justify-center">
                  <div class="relative">
                    <button
                      on:click={() => toggleBlockMenu(index)}
                      class="px-4 py-2 text-sm text-warm-gray-500 hover:text-warm-gray-700 border-2 border-dashed border-warm-gray-300 hover:border-warm-gray-400 rounded-lg transition-colors"
                    >
                      + Add Block
                    </button>
                    {#if openBlockMenu === index}
                      <div class="absolute top-full left-1/2 -translate-x-1/2 mt-1 flex flex-col bg-white border border-warm-gray-200 rounded-lg shadow-lg py-2 min-w-48 z-20">
                        {#each blockTypes as bt}
                          <button
                            on:click={() => addBlock(bt.type, index)}
                            class="flex items-center gap-3 px-4 py-2 text-left hover:bg-warm-gray-50"
                          >
                            <span class="text-lg">{bt.icon}</span>
                            <div>
                              <div class="text-sm font-medium text-warm-gray-900">{bt.label}</div>
                              <div class="text-xs text-warm-gray-500">{bt.description}</div>
                            </div>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </div>

        <!-- Preview Panel -->
        <div class="lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">
          <div class="bg-white rounded-lg border border-warm-gray-200 h-full flex flex-col">
            <div class="flex items-center justify-between px-4 py-3 border-b border-warm-gray-200">
              <h3 class="font-medium text-warm-gray-900">Preview</h3>
              <div class="flex items-center gap-2">
                <button
                  on:click={() => viewMode = 'desktop'}
                  class="px-3 py-1 text-xs rounded {viewMode === 'desktop' ? 'bg-warm-gray-900 text-white' : 'bg-warm-gray-100 text-warm-gray-700'}"
                >
                  Desktop
                </button>
                <button
                  on:click={() => viewMode = 'mobile'}
                  class="px-3 py-1 text-xs rounded {viewMode === 'mobile' ? 'bg-warm-gray-900 text-white' : 'bg-warm-gray-100 text-warm-gray-700'}"
                >
                  Mobile
                </button>
                <button
                  on:click={updatePreview}
                  disabled={previewLoading}
                  class="px-3 py-1 text-xs bg-warm-gray-100 text-warm-gray-700 rounded hover:bg-warm-gray-200"
                >
                  {previewLoading ? '...' : 'Refresh'}
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-auto p-4 bg-warm-gray-100">
              <div class="mx-auto transition-all duration-300 {viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-[600px]'}">
                {#if previewLoading && !previewHtml}
                  <div class="text-center py-12">
                    <p class="text-warm-gray-500">Loading preview...</p>
                  </div>
                {:else if previewHtml}
                  <div class="bg-white rounded shadow-sm overflow-hidden">
                    <iframe
                      srcdoc={previewHtml}
                      title="Email Preview"
                      class="w-full border-0"
                      style="height: 800px;"
                    />
                  </div>
                {:else}
                  <div class="text-center py-12">
                    <p class="text-warm-gray-500">Add content to see preview</p>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Test Email Modal -->
{#if showTestModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-bold text-warm-gray-900 mb-4">Send Test Email</h3>
      <div class="mb-4">
        <label class="block text-sm font-medium text-warm-gray-700 mb-1">Email Address</label>
        <input
          type="email"
          bind:value={testEmail}
          placeholder="your@email.com"
          class="w-full px-3 py-2 border border-warm-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div class="flex justify-end gap-3">
        <button
          on:click={() => showTestModal = false}
          class="px-4 py-2 text-sm text-warm-gray-700 hover:bg-warm-gray-100 rounded"
        >
          Cancel
        </button>
        <button
          on:click={sendTestEmail}
          disabled={sendingTest || !testEmail}
          class="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {sendingTest ? 'Sending...' : 'Send Test'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Send Confirmation Modal -->
{#if showSendConfirm}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-bold text-warm-gray-900 mb-2">Send Newsletter?</h3>
      <p class="text-warm-gray-600 mb-4">
        This will send the newsletter to <strong>{subscriberCount}</strong> verified subscribers. This action cannot be undone.
      </p>
      <div class="bg-warm-gray-50 rounded p-3 mb-4">
        <div class="text-sm">
          <strong>Subject:</strong> {newsletter.subject}
        </div>
        <div class="text-sm mt-1">
          <strong>Recipients:</strong> {subscriberCount} subscribers
        </div>
      </div>
      <div class="flex justify-end gap-3">
        <button
          on:click={() => showSendConfirm = false}
          class="px-4 py-2 text-sm text-warm-gray-700 hover:bg-warm-gray-100 rounded"
        >
          Cancel
        </button>
        <button
          on:click={sendToSubscribers}
          disabled={sending}
          class="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send Now'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  iframe {
    display: block;
  }
</style>
