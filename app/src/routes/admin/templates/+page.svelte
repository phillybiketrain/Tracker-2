<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_URL } from '$lib/config.js';

  let token = '';
  let region = 'philly';
  let templates = [];
  let loading = true;
  let editing = null;
  let saving = false;
  let error = '';
  let success = '';
  let showPreview = false;
  let previewHtml = '';

  onMount(() => {
    token = localStorage.getItem('admin_token');
    region = localStorage.getItem('admin_region') || 'philly';

    if (!token) {
      goto('/admin');
      return;
    }

    loadTemplates();
  });

  async function loadTemplates() {
    loading = true;

    try {
      const res = await fetch(`${API_URL}/admin/email/templates?region=${region}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('admin_token');
          goto('/admin');
          return;
        }
        throw new Error('Failed to load templates');
      }

      const data = await res.json();
      templates = data.data;

    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      loading = false;
    }
  }

  function startEdit(template) {
    editing = {
      id: template.id,
      type: template.template_type,
      subject: template.subject,
      html_body: template.html_body,
      text_body: template.text_body
    };
    error = '';
    success = '';
    updatePreview();
  }

  function cancelEdit() {
    editing = null;
    error = '';
    success = '';
    showPreview = false;
  }

  function updatePreview() {
    if (!editing) return;

    // Replace template variables with sample data
    let html = editing.html_body;

    // Sample data for preview
    const sampleData = {
      region_name: 'Philly Bike Train',
      unsubscribe_url: '#',
      message: 'This is a sample message for preview purposes.',
      routes: `
        <div style="margin: 20px 0;">
          <div style="margin-bottom: 20px; padding: 15px; border-left: 3px solid #E85D04; background: #f9f9f9;">
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">Morning Commute Train</div>
            <div style="color: #666; margin-bottom: 5px;">Join us for a safe ride downtown</div>
            <div style="font-size: 14px; color: #333;">📅 Monday, January 15 at 8:00 AM</div>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">Tag: regular</div>
          </div>
          <div style="margin-bottom: 20px; padding: 15px; border-left: 3px solid #E85D04; background: #f9f9f9;">
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">Weekend Explorer Ride</div>
            <div style="color: #666; margin-bottom: 5px;">Casual neighborhood tour</div>
            <div style="font-size: 14px; color: #333;">📅 Saturday, January 20 at 10:00 AM</div>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">Tag: community</div>
          </div>
        </div>
      `
    };

    // Replace all variables
    Object.keys(sampleData).forEach(key => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(placeholder, sampleData[key]);
    });

    previewHtml = html;
  }

  async function saveTemplate() {
    if (!editing.subject || !editing.html_body || !editing.text_body) {
      error = 'All fields are required';
      return;
    }

    saving = true;
    error = '';
    success = '';

    try {
      const res = await fetch(`${API_URL}/admin/email/templates/${editing.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject: editing.subject,
          html_body: editing.html_body,
          text_body: editing.text_body
        })
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.error || 'Failed to save template';
        return;
      }

      success = 'Template saved successfully';
      editing = null;
      await loadTemplates();

    } catch (err) {
      error = 'Failed to save template';
      console.error(err);
    } finally {
      saving = false;
    }
  }

  function getTemplateDescription(type) {
    switch(type) {
      case 'weekly_digest':
        return 'Sent every Sunday at 8 AM with upcoming rides for the week';
      case 'confirmation':
        return 'Sent when someone subscribes to email notifications';
      case 'blast':
        return 'Default template for manual email blasts';
      default:
        return '';
    }
  }
</script>

<svelte:head>
  <title>Email Templates - Admin</title>
</svelte:head>

<div class="min-h-screen bg-warm-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-warm-gray-200">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-warm-gray-900">Email Templates</h1>
          <p class="text-sm text-warm-gray-600 mt-1">{region}</p>
        </div>
        <a href="/admin/dashboard" class="text-sm text-warm-gray-600 hover:text-warm-gray-900">
          Back to Dashboard
        </a>
      </div>
    </div>
  </div>

  <div class="container mx-auto px-6 py-8">
    {#if loading}
      <div class="text-center py-12">
        <p class="text-warm-gray-600">Loading templates...</p>
      </div>
    {:else if editing}
      <!-- Edit Form with Preview -->
      <div class="max-w-7xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Editor -->
          <div class="bg-white rounded-lg border border-warm-gray-200 p-6">
            <div class="mb-6">
              <h2 class="text-lg font-bold text-warm-gray-900 mb-1">
                Edit {editing.type.replace('_', ' ')}
              </h2>
              <p class="text-sm text-warm-gray-600">
                {getTemplateDescription(editing.type)}
              </p>
            </div>

            <div class="space-y-4 mb-6">
              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Subject Line
                </label>
                <input
                  type="text"
                  bind:value={editing.subject}
                  on:input={updatePreview}
                  disabled={saving}
                  class="w-full px-4 py-2 border border-warm-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  HTML Body
                </label>
                <textarea
                  bind:value={editing.html_body}
                  on:input={updatePreview}
                  disabled={saving}
                  rows="15"
                  class="w-full px-4 py-2 border border-warm-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                ></textarea>
                <p class="text-xs text-warm-gray-500 mt-1">
                  Available variables: <code>{`{{routes}}`}</code>, <code>{`{{unsubscribe_url}}`}</code>, <code>{`{{message}}`}</code>, <code>{`{{region_name}}`}</code>
                </p>
              </div>

              <div>
                <label class="block text-sm font-medium text-warm-gray-900 mb-2">
                  Plain Text Body
                </label>
                <textarea
                  bind:value={editing.text_body}
                  disabled={saving}
                  rows="8"
                  class="w-full px-4 py-2 border border-warm-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                ></textarea>
              </div>
            </div>

            {#if error}
              <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            {/if}

            {#if success}
              <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                {success}
              </div>
            {/if}

            <div class="flex justify-end gap-3">
              <button
                on:click={cancelEdit}
                disabled={saving}
                class="px-6 py-2 border border-warm-gray-300 rounded text-warm-gray-700 hover:bg-warm-gray-50"
              >
                Cancel
              </button>
              <button
                on:click={saveTemplate}
                disabled={saving}
                class="px-6 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>

          <!-- Preview Panel -->
          <div class="bg-white rounded-lg border border-warm-gray-200 p-6">
            <div class="mb-4">
              <h3 class="text-lg font-bold text-warm-gray-900">Email Preview</h3>
              <p class="text-xs text-warm-gray-500 mt-1">Live preview with sample data</p>
            </div>

            <div class="border border-warm-gray-200 rounded-lg overflow-hidden">
              <!-- Email Header -->
              <div class="bg-warm-gray-100 px-4 py-2 border-b border-warm-gray-200">
                <div class="text-xs text-warm-gray-600 mb-1">Subject:</div>
                <div class="text-sm font-medium text-warm-gray-900">{editing.subject}</div>
              </div>

              <!-- Email Body Preview -->
              <div class="p-4 bg-white overflow-auto" style="max-height: 600px;">
                {@html previewHtml}
              </div>
            </div>

            <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
              <strong>Preview Variables:</strong>
              <ul class="mt-1 space-y-0.5">
                <li>• region_name: Philly Bike Train</li>
                <li>• routes: 2 sample rides</li>
                <li>• message: Sample message</li>
                <li>• unsubscribe_url: #</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <!-- Templates List -->
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-lg border border-warm-gray-200">
          <div class="px-6 py-4 border-b border-warm-gray-200">
            <h2 class="text-lg font-bold text-warm-gray-900">Templates</h2>
            <p class="text-sm text-warm-gray-600 mt-1">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
          </div>

          <div class="divide-y divide-warm-gray-100">
            {#each templates as template (template.id)}
              <div class="px-6 py-4 hover:bg-warm-gray-50">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h3 class="font-semibold text-warm-gray-900 capitalize">
                      {template.template_type.replace('_', ' ')}
                    </h3>
                    <p class="text-sm text-warm-gray-600 mt-1">
                      {getTemplateDescription(template.template_type)}
                    </p>
                    <div class="mt-2 text-sm text-warm-gray-600">
                      <div class="font-medium">Subject: {template.subject}</div>
                    </div>
                    {#if template.updated_at}
                      <div class="text-xs text-warm-gray-500 mt-2">
                        Last updated {new Date(template.updated_at).toLocaleDateString()}
                        {#if template.updated_by}by {template.updated_by}{/if}
                      </div>
                    {/if}
                  </div>

                  <button
                    on:click={() => startEdit(template)}
                    class="ml-4 px-4 py-2 bg-warm-gray-100 text-warm-gray-700 text-sm font-medium rounded hover:bg-warm-gray-200"
                  >
                    Edit
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
          <h3 class="text-sm font-semibold text-blue-900 mb-2">Template Variables</h3>
          <ul class="text-sm text-blue-800 space-y-1">
            <li>• <code>{`{{routes}}`}</code> - List of upcoming rides (weekly digest)</li>
            <li>• <code>{`{{unsubscribe_url}}`}</code> - Link to unsubscribe</li>
            <li>• <code>{`{{message}}`}</code> - Custom message content (blast template)</li>
          </ul>
        </div>
      </div>
    {/if}
  </div>
</div>
