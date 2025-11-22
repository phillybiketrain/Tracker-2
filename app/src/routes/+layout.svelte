<script>
  import '../app.css';
  let mobileMenuOpen = false;
</script>

<div class="min-h-screen flex flex-col bg-cream">
  <!-- Header -->
  <header class="bg-white border-b border-warm-gray-200">
    <nav class="container mx-auto px-6 py-3">
      <div class="flex items-center justify-between">
        <a href="/" class="text-xl font-bold text-warm-gray-900" style="font-family: 'Space Grotesk', sans-serif;">
          Philly Bike Train
        </a>

        <!-- Desktop nav -->
        <div class="hidden md:flex gap-3">
          <a href="/browse" class="px-4 py-2 rounded-full text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Browse
          </a>
          <a href="/lead" class="px-4 py-2 rounded-full text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Lead
          </a>
          <a href="/follow" class="px-4 py-2 rounded-full text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Broadcast
          </a>
        </div>

        <!-- Mobile hamburger -->
        <button
          on:click={() => mobileMenuOpen = !mobileMenuOpen}
          class="md:hidden p-2"
          aria-label="Toggle menu"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if mobileMenuOpen}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            {/if}
          </svg>
        </button>
      </div>

      <!-- Mobile menu -->
      {#if mobileMenuOpen}
        <div class="md:hidden pt-4 pb-2 space-y-2">
          <a href="/browse" class="block px-4 py-2 rounded-lg text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Browse
          </a>
          <a href="/lead" class="block px-4 py-2 rounded-lg text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Lead
          </a>
          <a href="/follow" class="block px-4 py-2 rounded-lg text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Broadcast
          </a>
        </div>
      {/if}
    </nav>
  </header>

  <!-- Main content -->
  <main class="flex-1">
    <slot />
  </main>

  <!-- Footer -->
  <footer class="bg-warm-gray-50 border-t border-warm-gray-200 py-6 mt-auto">
    <div class="container mx-auto px-6 text-center">
      <p class="text-sm text-warm-gray-600">
        © 2024 Philly Bike Train · Fixed-route bike transit
      </p>
    </div>
  </footer>
</div>
