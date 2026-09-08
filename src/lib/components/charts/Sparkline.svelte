<script>
	/** Mini sparkline de barras ascendentes, decorativo, para cards em destaque. */
	let { values = [], width = 96, height = 32, color = 'rgba(255,255,255,.92)' } = $props();

	const max = $derived(Math.max(1, ...values.map((v) => Math.abs(v))));
	const n = $derived(Math.max(1, values.length));
	const barW = $derived(width / (n * 1.7));
</script>

<svg {width} {height} viewBox="0 0 {width} {height}">
	{#each values as v, i (i)}
		{@const h = Math.max(2, (Math.abs(v) / max) * height)}
		{@const x = i * (width / n)}
		<rect x={x} y={height - h} width={barW} height={h} rx={barW / 2} fill={color} opacity={0.35 + 0.65 * (i / (n - 1 || 1))} />
	{/each}
</svg>
