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
          <a href="/" class="px-4 py-2 rounded-full text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Browse
          </a>
          <a href="/live" class="px-4 py-2 rounded-full text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Live Now
          </a>
          <a href="/create" class="px-4 py-2 rounded-full text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Create Route
          </a>
          <a href="/manage" class="px-4 py-2 rounded-full text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            My Routes
          </a>
          <a href="/subscribe" class="px-4 py-2 rounded-full text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Subscribe
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
          <a href="/" class="block px-4 py-2 rounded-lg text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Browse
          </a>
          <a href="/live" class="block px-4 py-2 rounded-lg text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Live Now
          </a>
          <a href="/create" class="block px-4 py-2 rounded-lg text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Create Route
          </a>
          <a href="/manage" class="block px-4 py-2 rounded-lg text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            My Routes
          </a>
          <a href="/subscribe" class="block px-4 py-2 rounded-lg text-sm font-semibold text-warm-gray-900 hover:bg-warm-gray-100 transition-colors">
            Subscribe
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
