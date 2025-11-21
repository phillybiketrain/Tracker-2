<script>
  import '../app.css';
</script>

<div class="min-h-screen flex flex-col bg-cream">
  <!-- Header -->
  <header class="bg-white border-b border-warm-gray-200">
    <nav class="container mx-auto px-6 py-5">
      <div class="flex items-center justify-between">
        <a href="/" class="text-2xl font-bold text-warm-gray-900 tracking-tight">
          Philly Bike Train
        </a>

        <div class="flex gap-8">
          <a href="/browse" class="text-base font-semibold text-warm-gray-900 hover:text-primary transition-colors">
            Browse
          </a>
          <a href="/lead" class="text-base font-semibold text-warm-gray-900 hover:text-primary transition-colors">
            Lead
          </a>
          <a href="/follow" class="text-base font-semibold text-warm-gray-900 hover:text-primary transition-colors">
            Broadcast
          </a>
        </div>
      </div>
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
