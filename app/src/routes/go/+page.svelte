<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let showEntry = false;
  let codeChars = ['', '', '', ''];
  let codeInputRefs = [null, null, null, null];

  function handleCodeInput(i, e) {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    codeChars[i] = val ? val[val.length - 1] : '';
    codeChars = [...codeChars];

    if (val && i < 3) {
      codeInputRefs[i + 1]?.focus();
    }

    if (codeChars.every(c => c)) {
      goto(`/broadcast?code=${codeChars.join('')}`);
    }
  }

  function handleCodeKeydown(i, e) {
    if (e.key === 'Backspace' && !codeChars[i] && i > 0) {
      codeChars[i - 1] = '';
      codeChars = [...codeChars];
      codeInputRefs[i - 1]?.focus();
    }
  }

  function handleCodePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);

    for (let i = 0; i < 4; i++) {
      codeChars[i] = text[i] || '';
    }
    codeChars = [...codeChars];

    if (text.length >= 4) {
      goto(`/broadcast?code=${text.slice(0, 4)}`);
    } else {
      codeInputRefs[Math.min(text.length, 3)]?.focus();
    }
  }

  onMount(() => {
    const savedCode = localStorage.getItem('my_route_code');
    if (savedCode) {
      // Known leader — send straight to their route, no history entry
      goto(`/broadcast?code=${savedCode}`, { replaceState: true });
    } else {
      showEntry = true;
      setTimeout(() => codeInputRefs[0]?.focus(), 100);
    }
  });
</script>

<svelte:head>
  <title>Lead a Ride - Philly Bike Train</title>
</svelte:head>

{#if !showEntry}
  <!-- Invisible flash while we check localStorage and redirect -->
  <div class="min-h-screen flex items-center justify-center bg-warm-gray-50">
    <div class="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
  </div>

{:else}
  <!-- First-time leader: enter code to get to broadcast page -->
  <div class="min-h-screen flex items-center justify-center bg-warm-gray-50">
    <div class="w-full max-w-sm mx-auto px-6">
      <div class="text-center mb-10">
        <h1 class="text-3xl font-bold text-warm-gray-900 mb-2">Lead a Ride</h1>
        <p class="text-warm-gray-500">Enter your 4-character route code</p>
      </div>

      <div class="flex gap-3 justify-center mb-10" on:paste={handleCodePaste}>
        {#each [0, 1, 2, 3] as i}
          <input
            bind:this={codeInputRefs[i]}
            type="text"
            maxlength="2"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="characters"
            spellcheck="false"
            value={codeChars[i]}
            on:input={(e) => handleCodeInput(i, e)}
            on:keydown={(e) => handleCodeKeydown(i, e)}
            class="w-16 h-20 text-center text-3xl font-mono font-bold uppercase border-2 rounded-xl focus:outline-none transition-colors {codeChars[i] ? 'border-primary bg-primary/5 text-primary' : 'border-warm-gray-300 bg-white text-warm-gray-900'} focus:border-primary"
          />
        {/each}
      </div>

      <p class="text-center text-sm text-warm-gray-500">
        Don't have a route yet?
        <a href="/create" class="text-primary hover:underline">Create one here</a>
      </p>
    </div>
  </div>
{/if}
